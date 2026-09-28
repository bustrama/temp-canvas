import { chunkAsset, ScreenGrabber } from '@/canvas/assets';
import type { Engine, EngineHooks } from '@/canvas/Engine';
import { peerName } from '@/canvas/peers';
import type { AssetMeta, Op, Shape } from '@/shared/model';
import type { DeviceKind, JoinMode, PeerInfo } from '@/shared/protocol';
import { RelayClient, type ConnStatus, type FatalReason } from './RelayClient';
import { clearCreating, clearSession, isCreating, loadSession, saveSession, tabClientId, type SavedSession } from './storage';

export interface SessionSnapshot {
  readonly status: ConnStatus;
  readonly failures: number;
  readonly fatal: { readonly reason: FatalReason; readonly message: string } | null;
  readonly notice: { readonly id: number; readonly text: string } | null;
  /** Our colour slot (see PEER_COLORS), once the relay assigned it. */
  readonly slot: number | null;
  /** Someone asked for a screen snapshot and this device has no capture running yet. */
  readonly snapshotRequest: { readonly from: string; readonly name: string } | null;
  readonly sharingScreen: boolean;
  readonly busy: boolean;
}

const SAVE_DEBOUNCE_MS = 800;

/**
 * Glue between the canvas engine, the relay connection and the tab's storage for one session.
 * React reads its snapshot through `subscribe`/`getSnapshot`.
 */
export class SessionController {
  readonly code: string;
  readonly clientId: string;
  readonly device: DeviceKind;
  readonly mode: JoinMode;
  readonly grabber = new ScreenGrabber();
  private readonly relay: RelayClient;
  private readonly saved: SavedSession | null;
  private engine: Engine | null = null;
  private snap: SessionSnapshot = { status: 'connecting', failures: 0, fatal: null, notice: null, slot: null, snapshotRequest: null, sharingScreen: false, busy: false };
  private readonly listeners = new Set<() => void>();
  private fresh = false;
  private serverAssets = new Set<string>();
  private incoming: Shape[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private assetRetry: ReturnType<typeof setTimeout> | null = null;
  private noticeSeq = 0;
  private disposed = false;

  constructor(opts: { code: string; device: DeviceKind; baseUrl: string }) {
    this.code = opts.code;
    this.device = opts.device;
    this.clientId = tabClientId();
    this.saved = loadSession(opts.code);
    this.mode = this.saved ? 'resume' : isCreating(opts.code) ? 'create' : 'join';
    this.relay = new RelayClient(
      { baseUrl: opts.baseUrl, code: opts.code, clientId: this.clientId, device: opts.device, mode: this.mode, slot: this.saved?.slot },
      {
        status: (status, { failures }) => this.set({ status, failures }),
        welcome: (w) => this.onWelcome(w.slot, w.fresh, w.peers, w.assets),
        shapes: (shapes, last) => this.onShapes(shapes, last),
        ops: (ops) => this.onRemoteOps(ops),
        live: (from, e) => this.engine?.applyLive(from, e),
        presence: (from, p) => this.engine?.peerPresence(from, p),
        peer: (peer, on) => {
          if (on) this.engine?.peerJoined(peer);
          else this.engine?.peerLeft(peer.id);
        },
        asset: (chunk) => {
          if (this.engine?.assets.receiveChunk(chunk)) this.scheduleSave();
        },
        command: (from, c) => {
          if (c.k === 'snapshot-request') void this.onSnapshotRequest(from);
          else if (c.k === 'snapshot-unavailable') this.notify('Screen snapshots need the desktop browser to share its screen first.');
        },
        fatal: (reason, message) => {
          if (reason === 'ended') clearSession(this.code);
          this.set({ fatal: { reason, message } });
        },
        error: (message) => this.notify(message),
      },
    );
    this.grabber.onChange = (active) => this.set({ sharingScreen: active });
  }

  // ---- React bindings ------------------------------------------------------------------------

  getSnapshot = (): SessionSnapshot => this.snap;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<SessionSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const fn of this.listeners) fn();
  }

  notify(text: string): void {
    this.set({ notice: { id: ++this.noticeSeq, text } });
  }

  dismissNotice(): void {
    this.set({ notice: null });
  }

  // ---- lifecycle -----------------------------------------------------------------------------

  /** Hooks the engine calls with local changes. */
  readonly engineHooks: EngineHooks = {
    commit: (ops) => this.relay.sendOps(ops),
    live: (e) => this.relay.sendLive(e),
    presence: (p) => this.relay.sendPresence(p),
    asset: (meta, data) => this.relay.sendAsset(chunkAsset(meta, data)),
    changed: () => this.scheduleSave(),
  };

  attach(engine: Engine): void {
    this.engine = engine;
    const saved = this.saved;
    if (saved) {
      for (const a of saved.assets) engine.assets.add(a.meta, a.data);
      engine.loadShapes(saved.shapes);
      if (saved.camera) engine.setCamera(saved.camera, 'system');
    }
    // Deferred so React's dev double-mount (mount, unmount, mount) never opens two sockets.
    this.startTimer = setTimeout(() => this.relay.start(), 0);
    window.addEventListener('pagehide', this.saveNow);
  }

  dispose(): void {
    this.disposed = true;
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.assetRetry) clearTimeout(this.assetRetry);
    window.removeEventListener('pagehide', this.saveNow);
    if (!this.snap.fatal) this.saveNow();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.relay.stop();
    this.grabber.stop();
    this.engine = null;
  }

  /** Reconnect after an idle pause (call on user interaction). */
  wake(): void {
    this.relay.resume();
  }

  endSession(): void {
    this.relay.end();
  }

  // ---- relay events --------------------------------------------------------------------------

  private onWelcome(slot: number, fresh: boolean, peers: readonly PeerInfo[], assets: readonly AssetMeta[]): void {
    this.fresh = fresh;
    this.set({ slot });
    this.serverAssets = new Set(assets.map((a) => a.id));
    this.incoming = [];
    if (this.mode === 'create') clearCreating(this.code);
    this.engine?.setPeers(peers);
  }

  private onShapes(shapes: readonly Shape[], last: boolean): void {
    this.incoming.push(...shapes);
    if (!last) return;
    const engine = this.engine;
    if (!engine) return;
    const incoming = this.incoming;
    this.incoming = [];
    if (this.fresh) {
      // The relay had nothing (new room, or it forgot an old one): our copy becomes the room.
      const mine = engine.doc.all();
      if (mine.length > 0) {
        this.relay.seed(mine);
        const referenced = new Set(mine.flatMap((s) => (s.kind === 'image' ? [s.asset] : [])));
        for (const a of engine.assets.entries(referenced)) this.relay.sendAsset(chunkAsset(a.meta, a.data));
      }
      return;
    }
    engine.loadShapes(incoming);
    // Our unacknowledged edits go on top again (the relay gets them re-sent right after).
    const pending = this.relay.unacknowledged;
    if (pending.length > 0) engine.applyRemoteOps(pending);
    this.requestMissingAssets();
  }

  private onRemoteOps(ops: readonly Op[]): void {
    this.engine?.applyRemoteOps(ops);
    if (ops.some((op) => op.o === 'put' && op.shape.kind === 'image')) {
      // Image chunks travel just before the shape; ask again if some went missing.
      if (this.assetRetry) clearTimeout(this.assetRetry);
      this.assetRetry = setTimeout(() => this.requestMissingAssets(), 2500);
    }
  }

  private requestMissingAssets(): void {
    const engine = this.engine;
    if (!engine) return;
    const referenced = engine.doc.all().flatMap((s) => (s.kind === 'image' ? [s.asset] : []));
    this.relay.want(engine.assets.missing(referenced));
  }

  // ---- screen snapshots ----------------------------------------------------------------------

  /** Desktop: start sharing (asks the browser) and take the first snapshot, for `forPeer` if they asked. */
  async shareScreenAndSnapshot(forPeer?: string): Promise<void> {
    try {
      this.set({ busy: true });
      await this.grabber.start();
      await this.snapshot(forPeer);
    } catch (err) {
      if ((err as Error)?.name !== 'NotAllowedError') this.notify('Could not capture the screen.');
    } finally {
      this.set({ busy: false, snapshotRequest: null });
    }
  }

  /** Grabs the shared screen onto the canvas: into the view of whoever asked for it. */
  async snapshot(forPeer?: string): Promise<void> {
    const engine = this.engine;
    if (!engine) return;
    const img = await this.grabber.grab();
    const view = forPeer ? engine.getState().peers.find((p) => p.id === forPeer)?.pres?.view : undefined;
    engine.insertImage(img, { snapshot: true, target: view });
  }

  stopScreenShare(): void {
    this.grabber.stop();
  }

  /**
   * Tablet: ask a desktop for a snapshot of its screen: the one we follow, else the first desktop
   * online.
   */
  requestSnapshot(): void {
    const state = this.engine?.getState();
    const desktops = state?.peers.filter((p) => p.online && p.device === 'desktop') ?? [];
    const target = desktops.find((p) => p.id === state?.following) ?? desktops[0];
    if (!target) {
      this.notify('No desktop is connected to take a snapshot from.');
      return;
    }
    this.relay.sendCommand({ k: 'snapshot-request' }, target.id);
    this.notify(`Asked the ${peerName(target).toLowerCase()} for a screen snapshot…`);
  }

  dismissSnapshotRequest(): void {
    const req = this.snap.snapshotRequest;
    this.set({ snapshotRequest: null });
    if (req) this.relay.sendCommand({ k: 'snapshot-unavailable' }, req.from);
  }

  private async onSnapshotRequest(from: string): Promise<void> {
    if (this.grabber.active) {
      try {
        await this.snapshot(from);
      } catch {
        this.notify('Could not capture the screen.');
      }
    } else if (this.device === 'desktop') {
      const peer = this.engine?.getState().peers.find((p) => p.id === from);
      this.set({ snapshotRequest: { from, name: peer ? peerName(peer) : 'Someone' } });
    } else {
      this.relay.sendCommand({ k: 'snapshot-unavailable' }, from);
    }
  }

  // ---- persistence ---------------------------------------------------------------------------

  private scheduleSave(): void {
    if (this.disposed || this.saveTimer) return;
    this.saveTimer = setTimeout(this.saveNow, SAVE_DEBOUNCE_MS);
  }

  private readonly saveNow = (): void => {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const engine = this.engine;
    if (!engine || this.snap.fatal) return;
    const shapes = engine.doc.all();
    const referenced = new Set(shapes.flatMap((s) => (s.kind === 'image' ? [s.asset] : [])));
    saveSession({ v: 1, code: this.code, shapes, assets: engine.assets.entries(referenced), camera: engine.camera, slot: this.snap.slot ?? undefined });
  };
}
