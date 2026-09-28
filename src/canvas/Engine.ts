import { randomId } from '@/shared/code';
import { LIMITS, type AssetMeta, type GeoKind, type GeoShape, type ImageShape, type InkColor, type Op, type Shape, type StrokeShape, type StrokeStyle, type TextShape } from '@/shared/model';
import type { DeviceKind, LiveEvent, LiveStyle, PeerInfo, Presence } from '@/shared/protocol';
import { AssetStore } from './assets';
import { clampZoom, fitRect, lerpCamera, panBy, sameCamera, toScreen, toWorld, visibleRect, zoomAt, type Camera } from './camera';
import { Doc, History } from './doc';
import { capFlatPoints, dist, emptyBBox, padBBox, round, unionBBox, type BBox, type Pt } from './geometry';
import { defaultFollowTarget, followLoops, peerColor, peerName, shouldYieldFollow, type Peer } from './peers';
import { fitClosed, fitLine, HoldTracker, isLineLike, snapLineEnd } from './quickShape';
import { drawGeo, drawLaser, drawScene, drawShape, FALLBACK_PALETTE, inkFill, LASER_FADE_MS, outlineToPath, readPalette, strokeOutline, textFont, type LaserPoint, type Palette } from './render';
import { distanceToShape, hitsShape, lassoContains, setTextMeasurer, shapeBounds, translateShape } from './shapes';

/**
 * The canvas editor: owns the document, the camera, the tools and both canvas layers.
 *
 * - `scene` holds committed shapes; it is repainted only when they or the camera change.
 * - `live` holds everything transient: strokes in progress (ours and the others'), shape
 *   previews, laser trails, selection, lasso, eraser ring and the others' cursors/viewports.
 *
 * Input arrives in screen coordinates (CSS px relative to the host) from the InputRouter; changes
 * leave through `hooks` (committed ops, live previews, presence) for the sync layer.
 */

export type Tool = 'pen' | 'highlighter' | 'laser' | 'eraser' | 'select' | 'geo' | 'text' | 'hand';
export type PointerKind = 'pen' | 'mouse' | 'touch';

export const WIDTHS: Readonly<Record<StrokeStyle, readonly number[]>> = {
  pen: [2, 4, 7, 12],
  highlighter: [12, 22, 34, 48],
};
export const TEXT_SIZES: readonly number[] = [16, 24, 36, 56];
export const ERASER_RADIUS_PX = 12;
const MIN_POINT_SPACING_PX = 0.6;
const MAX_STROKE_POINTS = 4000;
const LASER_WIDTH_PX = 5;
const REMOTE_GHOST_TTL_MS = 4000;
const PRESENCE_INTERVAL_MS = 50;
const TAP_SLOP_PX = 6;
/** A member who left is shown greyed out for this long (a refresh comes back well within it). */
const PEER_FORGET_MS = 60_000;

export interface Sample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly time: number;
  readonly shift?: boolean;
}

export interface TextEdit {
  readonly id: string;
  readonly isNew: boolean;
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
  readonly color: InkColor;
  readonly z: number;
  text: string;
}

export type { Peer };

export interface EditorState {
  readonly tool: Tool;
  readonly geo: GeoKind;
  readonly color: InkColor;
  readonly width: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly selection: number;
  /** Id of the member whose view we follow. */
  readonly following: string | null;
  readonly fingerDraws: boolean;
  readonly penSeen: boolean;
  readonly textEdit: TextEdit | null;
  /** The other members, by colour slot; members who left linger (offline) for a minute. */
  readonly peers: readonly Peer[];
  readonly zoom: number;
  readonly empty: boolean;
}

export interface EngineHooks {
  commit(ops: Op[]): void;
  live(e: LiveEvent): void;
  presence(p: Presence): void;
  /** A new image to share (base64 payload). */
  asset(meta: AssetMeta, data: string): void;
  /** The document changed (any source): persistence hook. */
  changed(): void;
}

interface DrawSession {
  readonly kind: 'draw';
  readonly pointerId: number;
  readonly pointer: PointerKind;
  readonly id: string;
  readonly style: StrokeStyle;
  readonly color: InkColor;
  readonly size: number;
  readonly pts: number[];
  /** Screen positions at draw time, for shape recognition in screen px. */
  readonly screen: Pt[];
  predicted: number[];
  readonly hold: HoldTracker;
  holdTimer: ReturnType<typeof setTimeout> | null;
  snapped: GeoShape | null;
  sent: number;
}

interface LaserSession {
  readonly kind: 'laser';
  readonly pointerId: number;
  readonly id: string;
  sent: number;
}

interface EraseSession {
  readonly kind: 'erase';
  readonly pointerId: number;
  last: Pt | null;
  readonly hits: Set<string>;
}

interface SelectSession {
  readonly kind: 'select';
  readonly pointerId: number;
  readonly mode: 'lasso' | 'move';
  readonly lasso: Pt[];
  readonly start: Pt;
  readonly startScreen: Pt;
  last: Pt;
  maxScreenMove: number;
}

interface GeoSession {
  readonly kind: 'geo';
  readonly pointerId: number;
  readonly id: string;
  readonly start: Pt;
  shape: GeoShape | null;
}

interface TapSession {
  readonly kind: 'tap';
  readonly pointerId: number;
  readonly start: Pt;
  moved: boolean;
}

interface PanSession {
  readonly kind: 'pan';
  readonly pointerId: number;
  last: Pt;
}

type Session = DrawSession | LaserSession | EraseSession | SelectSession | GeoSession | TapSession | PanSession;

interface LaserTrail {
  /** Member who draws it (remote trails only). */
  readonly from?: string;
  readonly color: InkColor;
  readonly pts: LaserPoint[];
  ended: boolean;
}

interface RemoteStroke {
  readonly from: string;
  readonly style: StrokeStyle;
  readonly color: InkColor;
  readonly size: number;
  readonly pts: number[];
  endedAt: number | null;
}

export class Engine {
  readonly doc = new Doc();
  readonly assets: AssetStore;
  private readonly history = new History();
  private readonly host: HTMLElement;
  private readonly hooks: EngineHooks;
  private readonly clientId: string;
  private readonly scene: HTMLCanvasElement;
  private readonly live: HTMLCanvasElement;
  private readonly sceneCtx: CanvasRenderingContext2D;
  private readonly liveCtx: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private readonly disposers: Array<() => void> = [];

  private cam: Camera = { x: 0, y: 0, z: 1 };
  private width = 1;
  private height = 1;
  private dpr = 1;
  private palette: Palette = FALLBACK_PALETTE;

  private state: EditorState;
  private readonly listeners = new Set<() => void>();
  private readonly cameraListeners = new Set<(cam: Camera) => void>();

  private session: Session | null = null;
  private selection = new Set<string>();
  private moveOffset: { ids: Set<string>; dx: number; dy: number } | null = null;
  private hover: { p: Pt; pointer: PointerKind } | null = null;
  private readonly lasers = new Map<string, LaserTrail>();

  private readonly peers = new Map<string, Peer>();
  private readonly forgetTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Desktop: follow a tablet as soon as one joins, until the person picks (or navigates) themselves. */
  private autoFollow: boolean;
  private lastFollowed: string | null = null;

  // The others' work in progress, keyed by stroke/shape id (hidden and moved sets by member).
  private readonly remoteStrokes = new Map<string, RemoteStroke>();
  private readonly remoteGhosts = new Map<string, { from: string; shape: Shape }>();
  private readonly remoteLasers = new Map<string, LaserTrail>();
  private readonly remoteHidden = new Map<string, ReadonlySet<string>>();
  private readonly remoteOffsets = new Map<string, { ids: ReadonlySet<string>; dx: number; dy: number }>();

  private sceneDirty = true;
  private liveDirty = true;
  private frame: number | null = null;
  private followTarget: Camera | null = null;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceSentAt = 0;
  private textGhostTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(host: HTMLElement, hooks: EngineHooks, opts: { clientId: string; device: DeviceKind }) {
    this.host = host;
    this.hooks = hooks;
    this.clientId = opts.clientId;
    this.autoFollow = opts.device === 'desktop';
    this.assets = new AssetStore(() => this.invalidateScene());
    this.state = {
      tool: 'pen',
      geo: 'rect',
      color: 'ink',
      width: 1,
      canUndo: false,
      canRedo: false,
      selection: 0,
      following: null,
      fingerDraws: true,
      penSeen: false,
      textEdit: null,
      peers: [],
      zoom: 1,
      empty: true,
    };

    this.scene = makeLayer('scene');
    this.live = makeLayer('live');
    host.append(this.scene, this.live);
    const sceneCtx = this.scene.getContext('2d');
    // No `desynchronized`: on some Android devices (Samsung Galaxy) that low-latency canvas is put in a
    // hardware overlay that ignores transparency, so this layer shows black over the scene below.
    const liveCtx = this.live.getContext('2d');
    if (!sceneCtx || !liveCtx) throw new Error('Canvas 2D is not available');
    this.sceneCtx = sceneCtx;
    this.liveCtx = liveCtx;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.disposers.push(this.doc.subscribe(() => this.onDocChange()));
    this.refreshTheme();
    this.resize();
  }

  // ---- state for the UI ----------------------------------------------------------------------

  getState = (): EditorState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  get camera(): Camera {
    return this.cam;
  }

  get viewportSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  subscribeCamera(fn: (cam: Camera) => void): () => void {
    this.cameraListeners.add(fn);
    return () => this.cameraListeners.delete(fn);
  }

  private update(patch: Partial<EditorState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  // ---- theme and layout ----------------------------------------------------------------------

  refreshTheme(): void {
    this.palette = readPalette(this.host);
    const measure = document.createElement('canvas').getContext('2d');
    if (measure) {
      measure.font = textFont(100, this.palette.fontFamily);
      setTextMeasurer((line) => measure.measureText(line).width / 100);
    }
    this.host.style.setProperty('--grid-color', this.palette.grid);
    this.invalidateScene();
  }

  private resize(): void {
    const rect = this.host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    if (w === this.width && h === this.height && dpr === this.dpr) return;
    // Keep the centre of the view in place when the window resizes or the tablet rotates.
    const centre = toWorld(this.cam, this.width / 2, this.height / 2);
    const first = this.width === 1 && this.height === 1;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    for (const c of [this.scene, this.live]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    if (!first) this.cam = { x: centre.x - w / 2 / this.cam.z, y: centre.y - h / 2 / this.cam.z, z: this.cam.z };
    else this.cam = { x: -w / 2, y: -h / 2, z: 1 };
    this.cameraChanged();
    this.followPeer(true);
  }

  // ---- camera --------------------------------------------------------------------------------

  /** `user`: the person navigated (turns follow off). `follow`/`system`: programmatic. */
  setCamera(cam: Camera, reason: 'user' | 'follow' | 'system'): void {
    if (reason === 'user') {
      this.autoFollow = false;
      if (this.state.following) this.setFollowing(null);
    }
    const next = { x: cam.x, y: cam.y, z: clampZoom(cam.z) };
    if (sameCamera(next, this.cam, 1e-6)) return;
    this.cam = next;
    this.cameraChanged();
  }

  private cameraChanged(): void {
    const z = this.cam.z;
    // Dot grid as a CSS background: free to pan. Spacing doubles/halves to stay 18..54 px apart.
    let gap = 24 * z;
    while (gap < 18) gap *= 3;
    while (gap > 54) gap /= 3;
    const ox = -this.cam.x * z;
    const oy = -this.cam.y * z;
    this.host.style.backgroundSize = `${gap}px ${gap}px`;
    this.host.style.backgroundPosition = `${mod(ox, gap)}px ${mod(oy, gap)}px`;
    if (Math.abs(this.state.zoom - z) > 1e-4) this.update({ zoom: z });
    this.invalidateScene();
    this.schedulePresence();
    for (const fn of this.cameraListeners) fn(this.cam);
  }

  panBy(dx: number, dy: number): void {
    this.setCamera(panBy(this.cam, dx, dy), 'user');
  }

  zoomAt(factor: number, sx: number, sy: number): void {
    this.setCamera(zoomAt(this.cam, this.cam.z * factor, sx, sy), 'user');
  }

  zoomBy(factor: number): void {
    this.zoomAt(factor, this.width / 2, this.height / 2);
  }

  resetZoom(): void {
    this.setCamera(zoomAt(this.cam, 1, this.width / 2, this.height / 2), 'user');
  }

  /** Shows everything on the canvas (or the origin when empty). */
  fitContent(): void {
    let box: BBox = emptyBBox();
    for (const s of this.doc.all()) box = unionBBox(box, shapeBounds(s));
    if (!Number.isFinite(box.minX)) {
      this.setCamera({ x: -this.width / 2, y: -this.height / 2, z: 1 }, 'user');
      return;
    }
    let cam = fitRect({ x: box.minX, y: box.minY, w: box.maxX - box.minX, h: box.maxY - box.minY }, this.width, this.height, 48);
    if (cam.z > 2) cam = zoomAt(cam, 2, this.width / 2, this.height / 2);
    this.setCamera(cam, 'user');
  }

  visibleWorld(): { x: number; y: number; w: number; h: number } {
    return visibleRect(this.cam, this.width, this.height);
  }

  // ---- follow mode ---------------------------------------------------------------------------

  /** The person picked someone to follow (or nobody): automatic following stops for good. */
  setFollowing(id: string | null): void {
    this.autoFollow = false;
    this.follow(id);
  }

  /** Follow on/off (F key): back to whoever we followed last, else the first tablet, else anyone. */
  toggleFollowing(): void {
    if (this.state.following) {
      this.setFollowing(null);
      return;
    }
    const last = this.lastFollowed ? this.peers.get(this.lastFollowed) : undefined;
    const target =
      last?.online && !followLoops(this.peers, last.id, this.clientId)
        ? last.id
        : (defaultFollowTarget(this.peers, this.clientId, 'pen') ?? defaultFollowTarget(this.peers, this.clientId));
    if (target) this.setFollowing(target);
  }

  private follow(id: string | null): void {
    this.followTarget = null;
    if (id) this.lastFollowed = id;
    if (id !== this.state.following) {
      this.update({ following: id });
      this.schedulePresence();
      this.invalidateLive();
    }
    this.followPeer(true);
  }

  private maybeAutoFollow(): void {
    if (!this.autoFollow || this.state.following) return;
    const target = defaultFollowTarget(this.peers, this.clientId, 'pen');
    if (target) this.follow(target);
  }

  private followPeer(immediate: boolean): void {
    const id = this.state.following;
    const peer = id ? this.peers.get(id) : undefined;
    const view = peer?.online ? peer.pres?.view : undefined;
    // A loop (they follow us, maybe through others) waits until one side lets go.
    if (!view || view.w <= 0 || view.h <= 0 || followLoops(this.peers, id, this.clientId)) return;
    const target = fitRect(view, this.width, this.height);
    if (immediate) {
      this.followTarget = null;
      this.setCamera(target, 'follow');
    } else {
      this.followTarget = target;
      this.requestFrame();
    }
  }

  // ---- tools ---------------------------------------------------------------------------------

  setTool(tool: Tool): void {
    if (this.state.textEdit) this.commitText();
    this.abortSession();
    if (tool !== 'select') this.setSelection(new Set());
    this.update({ tool });
    this.schedulePresence();
    this.invalidateLive();
  }

  setGeo(geo: GeoKind): void {
    this.update({ geo, tool: 'geo' });
  }

  setColor(color: InkColor): void {
    this.update({ color });
    // Recolour the selection (one undo step).
    if (this.selection.size > 0) {
      const ops: Op[] = [];
      for (const id of this.selection) {
        const s = this.doc.get(id);
        if (s && s.kind !== 'image' && s.color !== color) ops.push({ o: 'put', shape: { ...s, color } });
      }
      this.commitLocal(ops);
    }
    const edit = this.state.textEdit;
    if (edit) {
      this.update({ textEdit: { ...edit, color } });
      this.sendTextGhost();
    }
    this.schedulePresence();
  }

  setWidth(index: number): void {
    this.update({ width: Math.max(0, Math.min(3, index)) });
  }

  setFingerDraws(on: boolean): void {
    this.update({ fingerDraws: on });
  }

  /** The first pen contact switches fingers to navigation (they would otherwise draw). */
  notePen(): void {
    if (!this.state.penSeen) this.update({ penSeen: true });
  }

  /** Whether a finger touch should draw rather than navigate. */
  fingerDrawsNow(): boolean {
    return this.state.fingerDraws && !this.state.penSeen && this.state.tool !== 'hand';
  }

  undo(): void {
    if (this.state.textEdit) this.commitText();
    this.abortSession();
    this.history.undo((ops) => this.applyLocal(ops));
    this.pruneSelection();
    this.syncHistoryState();
  }

  redo(): void {
    this.abortSession();
    this.history.redo((ops) => this.applyLocal(ops));
    this.pruneSelection();
    this.syncHistoryState();
  }

  deleteSelection(): void {
    if (this.selection.size === 0) return;
    this.commitLocal([...this.selection].filter((id) => this.doc.has(id)).map((id): Op => ({ o: 'del', id })));
    this.setSelection(new Set());
  }

  clearSelection(): void {
    this.setSelection(new Set());
  }

  selectAll(): void {
    this.update({ tool: 'select' });
    this.setSelection(new Set(this.doc.all().filter((s) => !(s.kind === 'image' && s.locked)).map((s) => s.id)));
  }

  // ---- pointer input -------------------------------------------------------------------------

  isActive(pointerId: number): boolean {
    return this.session?.pointerId === pointerId;
  }

  get hasSession(): boolean {
    return this.session !== null;
  }

  pointerDown(pointerId: number, s: Sample, pointer: PointerKind, opts: { eraser?: boolean; pan?: boolean } = {}): void {
    if (this.session) this.finishSession('commit');
    if (pointer === 'pen') this.notePen();
    this.followTarget = null;
    const tool: Tool = opts.pan ? 'hand' : opts.eraser ? 'eraser' : this.state.tool;
    if (this.state.textEdit && tool !== 'text') this.commitText();
    const p = toWorld(this.cam, s.x, s.y);

    switch (tool) {
      case 'pen':
      case 'highlighter':
        this.startDraw(pointerId, s, pointer, tool);
        break;
      case 'laser': {
        const id = randomId();
        this.lasers.set(id, { color: this.state.color, pts: [{ x: p.x, y: p.y, t: performance.now() }], ended: false });
        this.session = { kind: 'laser', pointerId, id, sent: 1 };
        this.hooks.live({ k: 'begin', id, style: 'laser', color: this.state.color, size: 0, pts: [round(p.x), round(p.y), 0] });
        break;
      }
      case 'eraser':
        this.session = { kind: 'erase', pointerId, last: null, hits: new Set() };
        this.eraseTo(p);
        break;
      case 'select': {
        const bounds = this.selectionBounds();
        const move = bounds !== null && p.x >= bounds.minX && p.x <= bounds.maxX && p.y >= bounds.minY && p.y <= bounds.maxY;
        this.session = { kind: 'select', pointerId, mode: move ? 'move' : 'lasso', lasso: [p], start: p, startScreen: { x: s.x, y: s.y }, last: p, maxScreenMove: 0 };
        break;
      }
      case 'geo':
        this.session = { kind: 'geo', pointerId, id: randomId(), start: p, shape: null };
        break;
      case 'text':
        this.session = { kind: 'tap', pointerId, start: { x: s.x, y: s.y }, moved: false };
        break;
      case 'hand':
        this.session = { kind: 'pan', pointerId, last: { x: s.x, y: s.y } };
        break;
    }
    this.hover = { p, pointer };
    this.schedulePresence();
    this.invalidateLive();
  }

  pointerMove(pointerId: number, samples: readonly Sample[], predicted: readonly Sample[] = []): void {
    const session = this.session;
    if (!session || session.pointerId !== pointerId || samples.length === 0) return;
    const last = samples[samples.length - 1];
    const lastWorld = toWorld(this.cam, last.x, last.y);
    this.hover = { p: lastWorld, pointer: this.hover?.pointer ?? 'mouse' };

    switch (session.kind) {
      case 'draw':
        this.extendDraw(session, samples, predicted);
        break;
      case 'laser': {
        const trail = this.lasers.get(session.id);
        if (!trail) break;
        for (const s of samples) {
          const w = toWorld(this.cam, s.x, s.y);
          trail.pts.push({ x: w.x, y: w.y, t: performance.now() });
        }
        const fresh = trail.pts.slice(session.sent);
        session.sent = trail.pts.length;
        this.hooks.live({ k: 'pts', id: session.id, pts: fresh.flatMap((q) => [round(q.x), round(q.y), 0]) });
        break;
      }
      case 'erase':
        for (const s of samples) this.eraseTo(toWorld(this.cam, s.x, s.y));
        break;
      case 'select': {
        for (const s of samples) {
          session.maxScreenMove = Math.max(session.maxScreenMove, dist(s, session.startScreen));
          if (session.mode === 'lasso') session.lasso.push(toWorld(this.cam, s.x, s.y));
        }
        session.last = lastWorld;
        if (session.mode === 'move') {
          const dx = lastWorld.x - session.start.x;
          const dy = lastWorld.y - session.start.y;
          this.moveOffset = { ids: new Set(this.selection), dx, dy };
          this.hooks.live({ k: 'xf', ids: [...this.selection], dx: round(dx), dy: round(dy) });
          this.invalidateScene();
        }
        break;
      }
      case 'geo': {
        const end = this.constrainGeo(session.start, lastWorld, last.shift === true);
        session.shape = this.geoShape(session.id, this.state.geo, session.start, end, 'pen');
        this.hooks.live({ k: 'ghost', id: session.id, shape: session.shape });
        break;
      }
      case 'tap':
        if (dist(last, session.start) > TAP_SLOP_PX) session.moved = true;
        break;
      case 'pan': {
        this.panBy(last.x - session.last.x, last.y - session.last.y);
        session.last = { x: last.x, y: last.y };
        break;
      }
    }
    this.schedulePresence();
    this.invalidateLive();
  }

  pointerUp(pointerId: number, s?: Sample): void {
    const session = this.session;
    if (!session || session.pointerId !== pointerId) return;
    if (s) this.pointerMove(pointerId, [s]);
    this.finishSession('commit');
  }

  /** Pointer interrupted. Ink already on screen is kept (like ink on paper) unless `discard`. */
  pointerCancel(pointerId: number, discard = false): void {
    const session = this.session;
    if (!session || session.pointerId !== pointerId) return;
    this.finishSession(discard ? 'discard' : 'commit');
  }

  /** Hovering pen or mouse (no contact); null when it left the canvas. */
  pointerHover(s: { x: number; y: number } | null, pointer: PointerKind): void {
    this.hover = s ? { p: toWorld(this.cam, s.x, s.y), pointer } : null;
    this.schedulePresence();
    if (this.state.tool === 'eraser' || this.hover === null) this.invalidateLive();
  }

  // ---- drawing -------------------------------------------------------------------------------

  private startDraw(pointerId: number, s: Sample, pointer: PointerKind, style: StrokeStyle): void {
    const widths = WIDTHS[style];
    const session: DrawSession = {
      kind: 'draw',
      pointerId,
      pointer,
      id: randomId(),
      style,
      color: this.state.color,
      size: round(widths[this.state.width] / this.cam.z, 3),
      pts: [],
      screen: [],
      predicted: [],
      hold: new HoldTracker(),
      holdTimer: null,
      snapped: null,
      sent: 0,
    };
    this.session = session;
    this.addDrawPoint(session, s);
    session.hold.reset({ x: s.x, y: s.y }, s.time, 0);
    this.scheduleHold(session, s.time);
    session.sent = session.pts.length;
    this.hooks.live({ k: 'begin', id: session.id, style, color: session.color, size: session.size, pts: session.pts.slice() });
  }

  private extendDraw(session: DrawSession, samples: readonly Sample[], predicted: readonly Sample[]): void {
    for (const s of samples) {
      if (session.snapped) {
        if (session.snapped.geo === 'line') {
          const a = toScreen(this.cam, session.snapped.a[0], session.snapped.a[1]);
          const { end } = snapLineEnd(a, { x: s.x, y: s.y });
          const w = toWorld(this.cam, end.x, end.y);
          session.snapped = { ...session.snapped, b: [round(w.x), round(w.y)] };
        }
        continue;
      }
      this.addDrawPoint(session, s);
      if (session.hold.update({ x: s.x, y: s.y }, s.time, session.screen.length - 1)) this.scheduleHold(session, s.time);
    }
    if (session.snapped) {
      session.predicted = [];
      this.hooks.live({ k: 'ghost', id: session.id, shape: session.snapped });
      return;
    }
    session.predicted = [];
    const lastPressure = session.pts[session.pts.length - 1];
    for (const s of predicted) {
      const w = toWorld(this.cam, s.x, s.y);
      session.predicted.push(w.x, w.y, clampPressure(s.pressure, session.pointer, lastPressure));
    }
    if (session.pts.length > session.sent) {
      this.hooks.live({ k: 'pts', id: session.id, pts: session.pts.slice(session.sent) });
      session.sent = session.pts.length;
    }
  }

  private addDrawPoint(session: DrawSession, s: Sample): void {
    const prev = session.screen[session.screen.length - 1];
    if (prev && dist(prev, s) < MIN_POINT_SPACING_PX) return;
    const prevPressure = session.pts.length > 0 ? session.pts[session.pts.length - 1] : undefined;
    const w = toWorld(this.cam, s.x, s.y);
    session.pts.push(round(w.x), round(w.y), round(clampPressure(s.pressure, session.pointer, prevPressure), 3));
    session.screen.push({ x: s.x, y: s.y });
  }

  private scheduleHold(session: DrawSession, now: number): void {
    if (session.holdTimer) clearTimeout(session.holdTimer);
    session.holdTimer = setTimeout(
      () => {
        session.holdTimer = null;
        if (this.session !== session || session.snapped) return;
        if (!session.hold.isHeld(performance.now())) return;
        this.tryQuickShape(session);
      },
      Math.max(0, session.hold.dueAt - now) + 5,
    );
  }

  private tryQuickShape(session: DrawSession): void {
    const upto = session.screen.slice(0, session.hold.anchorIndex + 1);
    let geo: GeoKind | null = null;
    let a: Pt | null = null;
    let b: Pt | null = null;
    if (isLineLike(fitLine(upto))) {
      geo = 'line';
      a = upto[0];
      b = snapLineEnd(a, upto[upto.length - 1]).end;
    } else {
      const closed = fitClosed(upto);
      if (closed) ({ kind: geo, a, b } = closed);
    }
    if (!geo || !a || !b) return;
    const wa = toWorld(this.cam, a.x, a.y);
    const wb = toWorld(this.cam, b.x, b.y);
    session.snapped = this.geoShape(session.id, geo, wa, wb, session.style, session.color, session.size);
    session.predicted = [];
    try {
      navigator.vibrate?.(8);
    } catch {
      // haptics are best effort
    }
    this.hooks.live({ k: 'ghost', id: session.id, shape: session.snapped });
    this.invalidateLive();
  }

  private geoShape(id: string, geo: GeoKind, a: Pt, b: Pt, style: StrokeStyle, color = this.state.color, size?: number): GeoShape {
    return {
      id,
      z: this.nextZ(),
      by: this.clientId,
      kind: 'geo',
      geo,
      style,
      color,
      size: size ?? round(WIDTHS.pen[this.state.width] / this.cam.z, 3),
      a: [round(a.x), round(a.y)],
      b: [round(b.x), round(b.y)],
    };
  }

  /** Shift: lines snap to 45°, rectangles and ellipses become squares and circles. */
  private constrainGeo(start: Pt, end: Pt, shift: boolean): Pt {
    if (!shift) return end;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (this.state.geo === 'line' || this.state.geo === 'arrow') {
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      return { x: start.x + Math.cos(angle) * len, y: start.y + Math.sin(angle) * len };
    }
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: start.x + Math.sign(dx || 1) * side, y: start.y + Math.sign(dy || 1) * side };
  }

  private eraseTo(p: Pt): void {
    const session = this.session;
    if (!session || session.kind !== 'erase') return;
    const a = session.last ?? p;
    session.last = p;
    const tol = ERASER_RADIUS_PX / this.cam.z;
    const minX = Math.min(a.x, p.x) - tol;
    const maxX = Math.max(a.x, p.x) + tol;
    const minY = Math.min(a.y, p.y) - tol;
    const maxY = Math.max(a.y, p.y) + tol;
    let changed = false;
    for (const s of this.doc.all()) {
      if (s.kind === 'image' || session.hits.has(s.id)) continue; // images only go via select + delete
      const b = shapeBounds(s);
      if (b.maxX < minX || b.minX > maxX || b.maxY < minY || b.minY > maxY) continue;
      if (distanceToShape(s, a, p) <= tol) {
        session.hits.add(s.id);
        changed = true;
      }
    }
    if (changed) {
      this.hooks.live({ k: 'hide', ids: [...session.hits] });
      this.invalidateScene();
    }
  }

  private finishSession(mode: 'commit' | 'discard'): void {
    const session = this.session;
    if (!session) return;
    this.session = null;
    switch (session.kind) {
      case 'draw': {
        if (session.holdTimer) clearTimeout(session.holdTimer);
        let shape: Shape | null = null;
        if (mode === 'commit') {
          if (session.snapped) shape = { ...session.snapped, z: this.nextZ() };
          else if (session.pts.length >= 3) {
            const z = this.cam.z;
            const pts = capFlatPoints(session.pts, MAX_STROKE_POINTS, [0.25 / z, 0.5 / z, 1 / z, 2 / z]);
            const stroke: StrokeShape = { id: session.id, z: this.nextZ(), by: this.clientId, kind: 'stroke', style: session.style, color: session.color, size: session.size, pts };
            shape = stroke;
          }
        }
        this.hooks.live({ k: 'end', id: session.id, keep: shape !== null });
        if (shape) this.commitLocal([{ o: 'put', shape }]);
        break;
      }
      case 'laser': {
        const trail = this.lasers.get(session.id);
        if (trail) trail.ended = true;
        this.hooks.live({ k: 'end', id: session.id, keep: false });
        break;
      }
      case 'erase':
        if (mode === 'commit' && session.hits.size > 0) this.commitLocal([...session.hits].map((id): Op => ({ o: 'del', id })));
        this.hooks.live({ k: 'hide', ids: [] });
        this.invalidateScene();
        break;
      case 'select':
        this.finishSelect(session, mode);
        break;
      case 'geo':
        if (mode === 'commit' && session.shape && dist({ x: session.shape.a[0], y: session.shape.a[1] }, { x: session.shape.b[0], y: session.shape.b[1] }) * this.cam.z > 4) {
          this.hooks.live({ k: 'end', id: session.id, keep: true });
          this.commitLocal([{ o: 'put', shape: { ...session.shape, z: this.nextZ() } }]);
        } else {
          this.hooks.live({ k: 'ghost', id: session.id, shape: null });
        }
        break;
      case 'tap':
        // A tap while editing finishes that text; the next tap places a new one.
        if (this.state.textEdit) this.commitText();
        else if (mode === 'commit' && !session.moved) this.placeText(toWorld(this.cam, session.start.x, session.start.y));
        break;
      case 'pan':
        break;
    }
    this.invalidateLive();
  }

  private abortSession(): void {
    if (this.session) this.finishSession(this.session.kind === 'draw' ? 'commit' : 'discard');
  }

  private finishSelect(session: SelectSession, mode: 'commit' | 'discard'): void {
    if (session.mode === 'move') {
      const off = this.moveOffset;
      this.moveOffset = null;
      if (mode === 'commit' && off && (off.dx !== 0 || off.dy !== 0)) {
        const ops: Op[] = [];
        for (const id of off.ids) {
          const s = this.doc.get(id);
          if (s) ops.push({ o: 'put', shape: translateShape(s, off.dx, off.dy) });
        }
        this.commitLocal(ops);
      }
      this.hooks.live({ k: 'xf', ids: [], dx: 0, dy: 0 });
      this.invalidateScene();
      return;
    }
    if (mode === 'discard') return;
    if (session.maxScreenMove <= TAP_SLOP_PX) {
      const hit = this.topmostAt(session.start, 8 / this.cam.z, true);
      this.setSelection(hit ? new Set([hit.id]) : new Set());
      return;
    }
    const picked = new Set<string>();
    for (const s of this.doc.all()) {
      if (s.kind === 'image' && s.locked) continue;
      if (lassoContains(s, session.lasso)) picked.add(s.id);
    }
    this.setSelection(picked);
  }

  private topmostAt(p: Pt, tolerance: number, includeLocked: boolean): Shape | null {
    const all = this.doc.all();
    for (let i = all.length - 1; i >= 0; i--) {
      const s = all[i];
      if (!includeLocked && s.kind === 'image' && s.locked) continue;
      if (hitsShape(s, p, tolerance)) return s;
    }
    return null;
  }

  private setSelection(ids: Set<string>): void {
    this.selection = ids;
    if (this.state.selection !== ids.size) this.update({ selection: ids.size });
    this.invalidateLive();
  }

  private pruneSelection(): void {
    const kept = new Set([...this.selection].filter((id) => this.doc.has(id)));
    if (kept.size !== this.selection.size) this.setSelection(kept);
  }

  private selectionBounds(): BBox | null {
    let box: BBox | null = null;
    for (const id of this.selection) {
      const s = this.doc.get(id);
      if (s) box = box ? unionBBox(box, shapeBounds(s)) : shapeBounds(s);
    }
    return box ? padBBox(box, 6 / this.cam.z) : null;
  }

  // ---- text ----------------------------------------------------------------------------------

  private placeText(p: Pt): void {
    const hit = this.topmostAt(p, 4 / this.cam.z, false);
    if (hit && hit.kind === 'text') {
      this.update({ textEdit: { id: hit.id, isNew: false, x: hit.x, y: hit.y, fontSize: hit.fontSize, color: hit.color, z: hit.z, text: hit.text } });
    } else {
      const fontSize = round(TEXT_SIZES[this.state.width] / this.cam.z, 3);
      this.update({ textEdit: { id: randomId(), isNew: true, x: round(p.x), y: round(p.y - fontSize * 0.62), fontSize, color: this.state.color, z: this.nextZ(), text: '' } });
    }
    this.invalidateScene();
  }

  updateText(text: string): void {
    const edit = this.state.textEdit;
    if (!edit) return;
    edit.text = text;
    if (!this.textGhostTimer) {
      this.textGhostTimer = setTimeout(() => {
        this.textGhostTimer = null;
        this.sendTextGhost();
      }, 80);
    }
  }

  private sendTextGhost(): void {
    const edit = this.state.textEdit;
    if (edit) this.hooks.live({ k: 'ghost', id: edit.id, shape: edit.text ? this.textShape(edit) : null });
  }

  private textShape(edit: TextEdit): TextShape {
    return { id: edit.id, z: edit.z, by: this.clientId, kind: 'text', color: edit.color, x: edit.x, y: edit.y, fontSize: edit.fontSize, text: edit.text.replace(/\s+$/, '') };
  }

  commitText(): void {
    const edit = this.state.textEdit;
    if (!edit) return;
    if (this.textGhostTimer) clearTimeout(this.textGhostTimer);
    this.textGhostTimer = null;
    this.update({ textEdit: null });
    const shape = this.textShape(edit);
    if (shape.text.trim()) this.commitLocal([{ o: 'put', shape }]);
    else if (!edit.isNew && this.doc.has(edit.id)) this.commitLocal([{ o: 'del', id: edit.id }]);
    this.hooks.live({ k: 'ghost', id: edit.id, shape: null });
    this.invalidateScene();
  }

  cancelText(): void {
    const edit = this.state.textEdit;
    if (!edit) return;
    this.update({ textEdit: null });
    this.hooks.live({ k: 'ghost', id: edit.id, shape: null });
    this.invalidateScene();
  }

  /** Pasted text lands as a text shape in the middle of the view. */
  insertText(text: string): void {
    const clean = text.replace(/\r\n?/g, '\n').slice(0, LIMITS.maxTextLength);
    if (!clean.trim()) return;
    const v = this.visibleWorld();
    const fontSize = round(TEXT_SIZES[this.state.width] / this.cam.z, 3);
    const shape: TextShape = { id: randomId(), z: this.nextZ(), by: this.clientId, kind: 'text', color: this.state.color, x: round(v.x + v.w * 0.3), y: round(v.y + v.h * 0.4), fontSize, text: clean };
    this.commitLocal([{ o: 'put', shape }]);
  }

  // ---- images --------------------------------------------------------------------------------

  /**
   * Adds an image (already prepared) centred in `target` (a world rect; defaults to this view),
   * scaled to fit it. Snapshots are locked and go to the back.
   */
  insertImage(img: { mime: string; w: number; h: number; data: string }, opts: { snapshot?: boolean; target?: { x: number; y: number; w: number; h: number } } = {}): void {
    const meta: AssetMeta = { id: randomId(), mime: img.mime, w: img.w, h: img.h };
    this.assets.add(meta, img.data);
    this.hooks.asset(meta, img.data);
    const view = opts.target ?? this.visibleWorld();
    const margin = opts.snapshot ? 0.04 : 0.2;
    const scale = Math.min((view.w * (1 - margin * 2)) / img.w, (view.h * (1 - margin * 2)) / img.h, opts.snapshot ? Infinity : 1 / this.cam.z);
    const w = img.w * scale;
    const h = img.h * scale;
    const shape: ImageShape = {
      id: randomId(),
      z: opts.snapshot ? this.doc.minZ() - 1 : this.nextZ(),
      by: this.clientId,
      kind: 'image',
      asset: meta.id,
      x: round(view.x + (view.w - w) / 2),
      y: round(view.y + (view.h - h) / 2),
      w: round(w),
      h: round(h),
      ...(opts.snapshot ? { locked: true } : {}),
    };
    this.commitLocal([{ o: 'put', shape }]);
  }

  // ---- document changes ----------------------------------------------------------------------

  private nextZ(): number {
    return Math.floor(this.doc.maxZ()) + 1;
  }

  private applyLocal(ops: readonly Op[]): Op[] {
    const inverse = this.doc.apply(ops, 'local');
    if (inverse.length > 0) this.hooks.commit([...ops]);
    return inverse;
  }

  private commitLocal(ops: Op[]): void {
    if (ops.length === 0) return;
    this.history.record(this.applyLocal(ops));
    this.syncHistoryState();
  }

  private syncHistoryState(): void {
    if (this.state.canUndo !== this.history.canUndo || this.state.canRedo !== this.history.canRedo) {
      this.update({ canUndo: this.history.canUndo, canRedo: this.history.canRedo });
    }
  }

  private onDocChange(): void {
    const empty = this.doc.size === 0;
    if (empty !== this.state.empty) this.update({ empty });
    this.invalidateScene();
    this.hooks.changed();
  }

  /**
   * Replaces everything (initial sync from the relay, or restoring the tab's copy). Undo history
   * is kept: its entries are re-evaluated against the document when used.
   */
  loadShapes(shapes: readonly Shape[]): void {
    this.doc.replaceAll(shapes, 'load');
    this.pruneSelection();
  }

  // ---- remote changes ------------------------------------------------------------------------

  applyRemoteOps(ops: readonly Op[]): void {
    for (const op of ops) {
      const id = op.o === 'put' ? op.shape.id : op.id;
      this.remoteStrokes.delete(id);
      this.remoteGhosts.delete(id);
    }
    this.doc.apply(ops, 'remote');
    this.pruneSelection();
    this.invalidateLive();
  }

  applyLive(from: string, e: LiveEvent): void {
    const now = performance.now();
    switch (e.k) {
      case 'begin':
        if (e.style === 'laser') {
          this.remoteLasers.set(e.id, { from, color: e.color, pts: spreadLaser(e.pts, now), ended: false });
        } else {
          this.remoteStrokes.set(e.id, { from, style: e.style as StrokeStyle, color: e.color, size: e.size, pts: [...e.pts], endedAt: null });
        }
        break;
      case 'pts': {
        const laser = this.remoteLasers.get(e.id);
        if (laser) laser.pts.push(...spreadLaser(e.pts, now));
        else this.remoteStrokes.get(e.id)?.pts.push(...e.pts);
        break;
      }
      case 'end': {
        const laser = this.remoteLasers.get(e.id);
        if (laser) laser.ended = true;
        const stroke = this.remoteStrokes.get(e.id);
        if (stroke && !e.keep) this.remoteStrokes.delete(e.id);
        else if (stroke) stroke.endedAt = now;
        const ghost = this.remoteGhosts.get(e.id);
        if (ghost && !e.keep) this.remoteGhosts.delete(e.id);
        break;
      }
      case 'ghost':
        this.remoteStrokes.delete(e.id);
        if (e.shape) this.remoteGhosts.set(e.id, { from, shape: e.shape });
        else this.remoteGhosts.delete(e.id);
        this.invalidateScene(); // a ghost hides the committed shape it edits (text)
        break;
      case 'xf':
        if (e.ids.length > 0) this.remoteOffsets.set(from, { ids: new Set(e.ids), dx: e.dx, dy: e.dy });
        else this.remoteOffsets.delete(from);
        this.invalidateScene();
        break;
      case 'hide':
        if (e.ids.length > 0) this.remoteHidden.set(from, new Set(e.ids));
        else this.remoteHidden.delete(from);
        this.invalidateScene();
        break;
    }
    this.invalidateLive();
  }

  // ---- the others ----------------------------------------------------------------------------

  /** Everyone connected right now (on joining or rejoining the relay); anyone else is gone. */
  setPeers(list: readonly PeerInfo[]): void {
    const ids = new Set(list.map((p) => p.id));
    for (const id of [...this.peers.keys()]) if (!ids.has(id)) this.removePeer(id);
    for (const p of list) this.peerJoined(p);
  }

  peerJoined(info: PeerInfo): void {
    if (info.id === this.clientId) return;
    this.cancelForget(info.id);
    this.putPeer({ id: info.id, device: info.device, slot: info.slot, online: true, pres: info.pres });
    this.maybeAutoFollow();
    if (info.id === this.state.following) this.followPeer(true);
  }

  peerLeft(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.clearPeerLive(id);
    this.putPeer({ ...peer, online: false, pres: null });
    this.cancelForget(id);
    this.forgetTimers.set(
      id,
      setTimeout(() => {
        this.forgetTimers.delete(id);
        this.removePeer(id);
      }, PEER_FORGET_MS),
    );
  }

  peerPresence(from: string, pres: Presence): void {
    const peer = this.peers.get(from);
    if (!peer) return;
    const hadView = !!peer.pres?.view;
    const followChanged = (pres.following ?? null) !== (peer.pres?.following ?? null);
    this.putPeer({ ...peer, online: true, pres });
    if (followChanged && shouldYieldFollow(this.peers, this.clientId, this.state.following, from)) {
      // They started following us (or someone who does) after we followed them: the newer follower wins.
      this.follow(null);
      this.maybeAutoFollow();
    } else if (from === this.state.following) {
      this.followPeer(!hadView);
    }
  }

  private putPeer(peer: Peer): void {
    this.peers.set(peer.id, peer);
    this.update({ peers: [...this.peers.values()].sort((a, b) => a.slot - b.slot) });
    this.invalidateLive();
  }

  private removePeer(id: string): void {
    this.cancelForget(id);
    this.clearPeerLive(id);
    if (!this.peers.delete(id)) return;
    this.update({ peers: [...this.peers.values()].sort((a, b) => a.slot - b.slot) });
    if (this.state.following === id) {
      this.follow(null);
      this.maybeAutoFollow();
    }
    this.invalidateLive();
  }

  private cancelForget(id: string): void {
    const t = this.forgetTimers.get(id);
    if (t !== undefined) clearTimeout(t);
    this.forgetTimers.delete(id);
  }

  private clearPeerLive(id: string): void {
    for (const [key, s] of this.remoteStrokes) if (s.from === id) this.remoteStrokes.delete(key);
    for (const [key, g] of this.remoteGhosts) if (g.from === id) this.remoteGhosts.delete(key);
    for (const [key, l] of this.remoteLasers) if (l.from === id) this.remoteLasers.delete(key);
    this.remoteHidden.delete(id);
    this.remoteOffsets.delete(id);
    this.invalidateScene();
  }

  // ---- presence ------------------------------------------------------------------------------

  private schedulePresence(): void {
    if (this.presenceTimer) return;
    const wait = Math.max(0, PRESENCE_INTERVAL_MS - (performance.now() - this.presenceSentAt));
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      this.presenceSentAt = performance.now();
      const h = this.hover;
      const v = this.visibleWorld();
      this.hooks.presence({
        cursor: h ? [round(h.p.x), round(h.p.y)] : null,
        pointer: h?.pointer ?? null,
        view: { x: round(v.x), y: round(v.y), w: round(v.w), h: round(v.h) },
        tool: this.state.tool,
        color: this.state.color,
        following: this.state.following,
      });
    }, wait);
  }

  // ---- rendering -----------------------------------------------------------------------------

  invalidateScene(): void {
    this.sceneDirty = true;
    this.liveDirty = true;
    this.requestFrame();
  }

  private invalidateLive(): void {
    this.liveDirty = true;
    this.requestFrame();
  }

  private requestFrame(): void {
    if (this.frame !== null || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.renderFrame();
    });
  }

  private renderFrame(): void {
    if (this.followTarget) {
      const next = lerpCamera(this.cam, this.followTarget, 0.35, this.width, this.height);
      const done = sameCamera(next, this.followTarget, 0.05);
      this.setCamera(done ? this.followTarget : next, 'follow');
      if (done) this.followTarget = null;
    }
    if (this.sceneDirty) {
      this.sceneDirty = false;
      this.renderScene();
    }
    let animating = this.followTarget !== null;
    if (this.liveDirty) {
      this.liveDirty = false;
      animating = this.renderLive() || animating;
    }
    if (animating) {
      this.liveDirty = true;
      this.requestFrame();
    }
  }

  private worldTransform(ctx: CanvasRenderingContext2D): void {
    const k = this.dpr * this.cam.z;
    ctx.setTransform(k, 0, 0, k, -this.cam.x * k, -this.cam.y * k);
  }

  private renderScene(): void {
    const ctx = this.sceneCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.scene.width, this.scene.height);
    this.worldTransform(ctx);
    const v = this.visibleWorld();
    const hidden = new Set<string>();
    for (const ids of this.remoteHidden.values()) for (const id of ids) hidden.add(id);
    if (this.session?.kind === 'erase') for (const id of this.session.hits) hidden.add(id);
    if (this.state.textEdit) hidden.add(this.state.textEdit.id);
    for (const id of this.remoteGhosts.keys()) hidden.add(id);
    const offsets = [...this.remoteOffsets.values()];
    if (this.moveOffset) offsets.unshift(this.moveOffset);
    drawScene(ctx, this.doc.all(), { minX: v.x, minY: v.y, maxX: v.x + v.w, maxY: v.y + v.h }, this.palette, this.assets, { hidden, offsets });
  }

  /** Returns true while something animates (laser fades, lingering ghosts). */
  private renderLive(): boolean {
    const ctx = this.liveCtx;
    const now = performance.now();
    let animating = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.live.width, this.live.height);
    this.worldTransform(ctx);

    // The others' work in progress.
    for (const [id, s] of this.remoteStrokes) {
      if (s.endedAt !== null && now - s.endedAt > REMOTE_GHOST_TTL_MS) {
        this.remoteStrokes.delete(id);
        continue;
      }
      if (s.endedAt !== null) animating = true;
      this.fillStroke(ctx, s.pts, s.size, s.style, s.color, false);
    }
    for (const g of this.remoteGhosts.values()) drawShape(ctx, g.shape, this.palette, this.assets);

    // Our own work in progress.
    const session = this.session;
    if (session?.kind === 'draw') {
      if (session.snapped) drawGeo(ctx, session.snapped, this.palette);
      else this.fillStroke(ctx, session.predicted.length > 0 ? [...session.pts, ...session.predicted] : session.pts, session.size, session.style, session.color, false);
    } else if (session?.kind === 'geo' && session.shape) {
      drawGeo(ctx, session.shape, this.palette);
    }

    // Laser trails (constant width on screen).
    const laserWidth = LASER_WIDTH_PX / this.cam.z;
    for (const trails of [this.lasers, this.remoteLasers]) {
      for (const [id, trail] of trails) {
        const newest = trail.pts[trail.pts.length - 1];
        if (trail.ended && (!newest || now - newest.t > LASER_FADE_MS)) {
          trails.delete(id);
          continue;
        }
        while (trail.pts.length > 2 && now - trail.pts[0].t > LASER_FADE_MS) trail.pts.shift();
        drawLaser(ctx, trail.pts, now, this.palette.ink[trail.color], laserWidth, 12 * this.dpr);
        animating = true;
      }
    }

    // Screen-space overlays.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawSelection(ctx);
    if (session?.kind === 'select' && session.mode === 'lasso' && session.lasso.length > 1) {
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = this.palette.selection;
      ctx.lineWidth = 1.5;
      ctx.fillStyle = withAlpha(this.palette.selection, 0.08);
      ctx.beginPath();
      session.lasso.forEach((p, i) => {
        const s = toScreen(this.cam, p.x, p.y);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    const erasing = session?.kind === 'erase' || (this.state.tool === 'eraser' && this.hover);
    if (erasing && this.hover) {
      const s = toScreen(this.cam, this.hover.p.x, this.hover.p.y);
      ctx.save();
      ctx.strokeStyle = this.palette.ink.ink;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, ERASER_RADIUS_PX, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    this.drawPeers(ctx);
    return animating;
  }

  private fillStroke(ctx: CanvasRenderingContext2D, pts: readonly number[], size: number, style: StrokeStyle, color: InkColor, complete: boolean): void {
    if (pts.length < 3) return;
    const { fill, alpha } = inkFill(style, color, this.palette);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.fill(outlineToPath(strokeOutline(pts, size, style, complete)));
    ctx.globalAlpha = 1;
  }

  private drawSelection(ctx: CanvasRenderingContext2D): void {
    const box = this.selectionBounds();
    if (!box) return;
    const off = this.moveOffset;
    const a = toScreen(this.cam, box.minX + (off?.dx ?? 0), box.minY + (off?.dy ?? 0));
    const b = toScreen(this.cam, box.maxX + (off?.dx ?? 0), box.maxY + (off?.dy ?? 0));
    ctx.save();
    ctx.strokeStyle = this.palette.selection;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.roundRect(a.x, a.y, b.x - a.x, b.y - a.y, 8);
    ctx.stroke();
    ctx.restore();
  }

  /** Each member's viewport outline and cursor, in their colour. */
  private drawPeers(ctx: CanvasRenderingContext2D): void {
    const online = this.state.peers.filter((p) => p.online && p.pres);
    const labelCursors = online.length > 1;
    ctx.save();
    ctx.font = `600 11px ${this.palette.fontFamily}`;
    for (const peer of online) {
      const pres = peer.pres as Presence;
      const color = this.palette.ink[peerColor(peer.slot)];
      // Skip the view we already show (followed) and views that mirror ours (they follow us).
      if (peer.id !== this.state.following && pres.following !== this.clientId && pres.view.w > 0) {
        const a = toScreen(this.cam, pres.view.x, pres.view.y);
        const b = toScreen(this.cam, pres.view.x + pres.view.w, pres.view.y + pres.view.h);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([10, 6]);
        ctx.beginPath();
        ctx.roundRect(a.x, a.y, b.x - a.x, b.y - a.y, 12);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = color;
        ctx.fillText(`${peerName(peer)} view`, a.x + 10, a.y + 18);
      }
      if (pres.cursor) {
        const s = toScreen(this.cam, pres.cursor[0], pres.cursor[1]);
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 10, 0, Math.PI * 2);
        ctx.stroke();
        if (labelCursors) {
          ctx.globalAlpha = 0.85;
          ctx.fillText(peerName(peer), s.x + 14, s.y + 18);
        }
      }
    }
    ctx.restore();
  }

  // ---- lifecycle -----------------------------------------------------------------------------

  dispose(): void {
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    if (this.presenceTimer) clearTimeout(this.presenceTimer);
    if (this.textGhostTimer) clearTimeout(this.textGhostTimer);
    for (const t of this.forgetTimers.values()) clearTimeout(t);
    this.forgetTimers.clear();
    this.resizeObserver.disconnect();
    for (const d of this.disposers.splice(0)) d();
    this.scene.remove();
    this.live.remove();
  }
}

/**
 * Pressure for a sample. Mouse and finger: constant. Pens report 0 on pointerup (and some devices
 * on contact): keep the previous pressure instead of jumping to 0.5, which would leave a blob.
 */
export function clampPressure(pressure: number, pointer: PointerKind, previous?: number): number {
  if (pointer !== 'pen') return 0.5;
  if (!(pressure > 0)) return previous ?? 0.5;
  return Math.min(1, pressure);
}

/** Spreads a batch of remote laser points over the last ~30 ms so the trail fades smoothly. */
function spreadLaser(pts: readonly number[], now: number): LaserPoint[] {
  const n = pts.length / 3;
  const out: LaserPoint[] = [];
  for (let i = 0; i < n; i++) out.push({ x: pts[i * 3], y: pts[i * 3 + 1], t: now - ((n - 1 - i) * 30) / Math.max(1, n) });
  return out;
}

function makeLayer(name: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.dataset.layer = name;
  c.setAttribute('aria-hidden', 'true');
  Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' } satisfies Partial<CSSStyleDeclaration>);
  return c;
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

function withAlpha(color: string, alpha: number): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  return color;
}

export type { LiveStyle };
