import { getStroke } from 'perfect-freehand';
import { INK_COLORS, type GeoShape, type ImageShape, type InkColor, type Shape, type StrokeShape, type StrokeStyle, type TextShape } from '@/shared/model';
import { bboxesOverlap, type BBox } from './geometry';
import { geoOutline, shapeBounds, TEXT_LINE_HEIGHT } from './shapes';

/**
 * Drawing of shapes in world coordinates: the caller sets the camera transform on the context.
 * Stroke outlines are computed once per shape (perfect-freehand, pressure-driven width) and cached
 * as Path2D, so panning and zooming only re-fill cached paths.
 */

export interface Palette {
  readonly ink: Readonly<Record<InkColor, string>>;
  readonly highlightAlpha: number;
  readonly selection: string;
  readonly placeholder: string;
  readonly grid: string;
  readonly fontFamily: string;
}

export const FALLBACK_PALETTE: Palette = {
  ink: { ink: '#2b2a33', rose: '#e0607e', peach: '#e8894f', lemon: '#d4a017', mint: '#3faa84', sky: '#4a8fd9', lilac: '#9170d6' },
  highlightAlpha: 0.35,
  selection: '#4a8fd9',
  placeholder: 'rgba(128,128,128,0.15)',
  grid: 'rgba(128,128,128,0.25)',
  fontFamily: 'system-ui, sans-serif',
};

/** Reads the theme's canvas tokens (CSS custom properties) from an element. */
export function readPalette(el: HTMLElement): Palette {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  const ink = {} as Record<InkColor, string>;
  for (const c of INK_COLORS) ink[c] = v(`--ink-${c}`, FALLBACK_PALETTE.ink[c]);
  return {
    ink,
    highlightAlpha: Number(v('--highlight-alpha', String(FALLBACK_PALETTE.highlightAlpha))) || FALLBACK_PALETTE.highlightAlpha,
    selection: v('--canvas-selection', FALLBACK_PALETTE.selection),
    placeholder: v('--canvas-placeholder', FALLBACK_PALETTE.placeholder),
    grid: v('--canvas-grid', FALLBACK_PALETTE.grid),
    fontFamily: cs.fontFamily || FALLBACK_PALETTE.fontFamily,
  };
}

// ---- ink ---------------------------------------------------------------------------------------

const PEN_OPTIONS = { thinning: 0.55, smoothing: 0.5, streamline: 0.3 } as const;
const HIGHLIGHTER_OPTIONS = { thinning: 0, smoothing: 0.6, streamline: 0.4 } as const;

/** Outline polygon of a pressure stroke given flat [x, y, p] triples. */
export function strokeOutline(pts: readonly number[], size: number, style: StrokeStyle, complete: boolean): number[][] {
  const input: number[][] = [];
  for (let i = 0; i < pts.length; i += 3) input.push([pts[i], pts[i + 1], pts[i + 2]]);
  return getStroke(input, {
    size,
    ...(style === 'pen' ? PEN_OPTIONS : HIGHLIGHTER_OPTIONS),
    simulatePressure: false,
    last: complete,
  });
}

export function outlineToPath(outline: readonly number[][]): Path2D {
  const path = new Path2D();
  if (outline.length < 2) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  // Quadratic curves through midpoints: smoother edges than straight segments at high zoom.
  for (let i = 1; i < outline.length - 1; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[i + 1];
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  const last = outline[outline.length - 1];
  path.lineTo(last[0], last[1]);
  path.closePath();
  return path;
}

const strokePaths = new WeakMap<StrokeShape, Path2D>();

function strokePath(s: StrokeShape): Path2D {
  let p = strokePaths.get(s);
  if (!p) {
    p = outlineToPath(strokeOutline(s.pts, s.size, s.style, true));
    strokePaths.set(s, p);
  }
  return p;
}

export function inkFill(style: StrokeStyle, color: InkColor, palette: Palette): { fill: string; alpha: number } {
  return { fill: palette.ink[color], alpha: style === 'highlighter' ? palette.highlightAlpha : 1 };
}

// ---- shapes ------------------------------------------------------------------------------------

export interface SceneImages {
  get(assetId: string): CanvasImageSource | null;
}

export function drawShape(ctx: CanvasRenderingContext2D, s: Shape, palette: Palette, images: SceneImages): void {
  switch (s.kind) {
    case 'stroke': {
      const { fill, alpha } = inkFill(s.style, s.color, palette);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.fill(strokePath(s));
      ctx.globalAlpha = 1;
      return;
    }
    case 'geo':
      drawGeo(ctx, s, palette);
      return;
    case 'text':
      drawText(ctx, s, palette);
      return;
    case 'image':
      drawImage(ctx, s, palette, images);
      return;
  }
}

export function drawGeo(ctx: CanvasRenderingContext2D, s: GeoShape, palette: Palette): void {
  const { fill, alpha } = inkFill(s.style, s.color, palette);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = fill;
  ctx.lineWidth = s.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const pts = geoOutline(s);
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (s.geo === 'rect' || s.geo === 'ellipse') ctx.closePath();
  if (s.geo === 'arrow') {
    const [ax, ay] = s.a;
    const [bx, by] = s.b;
    const angle = Math.atan2(by - ay, bx - ax);
    const len = Math.min(Math.max(s.size * 4, 10), Math.hypot(bx - ax, by - ay) * 0.5);
    for (const side of [-1, 1]) {
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - Math.cos(angle + side * 0.5) * len, by - Math.sin(angle + side * 0.5) * len);
    }
  }
  ctx.stroke();
  ctx.restore();
}

export function textFont(fontSize: number, family: string): string {
  return `500 ${fontSize}px ${family}`;
}

export function drawText(ctx: CanvasRenderingContext2D, s: TextShape, palette: Palette): void {
  ctx.save();
  ctx.fillStyle = palette.ink[s.color];
  ctx.font = textFont(s.fontSize, palette.fontFamily);
  ctx.textBaseline = 'top';
  const lines = s.text.split('\n');
  const lh = s.fontSize * TEXT_LINE_HEIGHT;
  const pad = (lh - s.fontSize) / 2;
  lines.forEach((line, i) => ctx.fillText(line, s.x, s.y + i * lh + pad));
  ctx.restore();
}

function drawImage(ctx: CanvasRenderingContext2D, s: ImageShape, palette: Palette, images: SceneImages): void {
  const img = images.get(s.asset);
  if (img) {
    ctx.drawImage(img, s.x, s.y, s.w, s.h);
    return;
  }
  ctx.save();
  ctx.fillStyle = palette.placeholder;
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.restore();
}

export interface SceneOptions {
  /** Ids not to paint (being erased, edited as text, or replaced by a ghost). */
  readonly hidden: ReadonlySet<string>;
  /** Shapes drawn offset while a selection is being moved (ours, and each other member's). */
  readonly offsets: ReadonlyArray<{ readonly ids: ReadonlySet<string>; readonly dx: number; readonly dy: number }>;
}

/** Paints the committed shapes that intersect `view` (world rect). Returns how many were drawn. */
export function drawScene(ctx: CanvasRenderingContext2D, shapes: readonly Shape[], view: BBox, palette: Palette, images: SceneImages, opts: SceneOptions): number {
  let drawn = 0;
  for (const s of shapes) {
    if (opts.hidden.has(s.id)) continue;
    const moving = opts.offsets.find((o) => o.ids.has(s.id));
    const b = shapeBounds(s);
    const box = moving ? { minX: b.minX + moving.dx, minY: b.minY + moving.dy, maxX: b.maxX + moving.dx, maxY: b.maxY + moving.dy } : b;
    if (!bboxesOverlap(box, view)) continue;
    if (moving) {
      ctx.save();
      ctx.translate(moving.dx, moving.dy);
      drawShape(ctx, s, palette, images);
      ctx.restore();
    } else {
      drawShape(ctx, s, palette, images);
    }
    drawn++;
  }
  return drawn;
}

// ---- transient marks ---------------------------------------------------------------------------

export interface LaserPoint {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export const LASER_FADE_MS = 900;

/** A fading laser trail. `width` is in world units (the caller keeps it constant on screen). */
export function drawLaser(ctx: CanvasRenderingContext2D, pts: readonly LaserPoint[], now: number, color: string, width: number, glow: number): void {
  if (pts.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  if (pts.length === 1) {
    const a = 1 - (now - pts[0].t) / LASER_FADE_MS;
    if (a > 0) {
      ctx.globalAlpha = a;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, width / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (let i = 1; i < pts.length; i++) {
    const age = now - pts[i].t;
    const a = 1 - age / LASER_FADE_MS;
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    ctx.lineWidth = width * (0.4 + 0.6 * a);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.restore();
}
