import { bboxOf, dist, pointSegmentDistance, polylineLength, type Pt } from './geometry';

/**
 * QuickShape: draw, keep the pen still for a moment at the end, and a rough stroke snaps into a
 * clean shape: a straight line (ported from draw-a-chart), or a closed rectangle / ellipse.
 * While the pen stays down after the snap, a line's end point follows the pen.
 * Thresholds are in screen px, so recognition feels the same at every zoom.
 */

export const QUICKSHAPE = {
  /** Pen must stay within this radius (CSS px) ... */
  holdRadiusPx: 5,
  /** ... for this long (ms) to trigger recognition. */
  holdMs: 450,
  /** Minimum chord length (CSS px) for a stroke to be considered a line. */
  minLengthPx: 24,
  /** Max perpendicular deviation allowed: max(abs, rel * chord). */
  maxDeviationAbsPx: 6,
  maxDeviationRel: 0.06,
  /** Path length / chord length ratio limit (rejects zig-zags and doubled-back strokes). */
  maxPathRatio: 1.15,
  /** Snap to exact horizontal/vertical within this many degrees. */
  angleSnapDeg: 4,
  /** Closed shapes: the gap between the ends must be under this fraction of the shape's size. */
  closeGapRel: 0.3,
  minClosedSizePx: 30,
  /** Mean distance from the ideal outline, relative to the shape's half-diagonal. */
  maxClosedError: 0.1,
} as const;

export interface LineFit {
  readonly start: Pt;
  readonly end: Pt;
  readonly chord: number;
  readonly maxDeviation: number;
  readonly pathRatio: number;
}

export function fitLine(points: readonly Pt[]): LineFit | null {
  if (points.length < 2) return null;
  const start = points[0];
  const end = points[points.length - 1];
  const chord = dist(start, end);
  if (chord === 0) return null;
  let maxDeviation = 0;
  for (const p of points) {
    const d = pointSegmentDistance(p, start, end);
    if (d > maxDeviation) maxDeviation = d;
  }
  return { start, end, chord, maxDeviation, pathRatio: polylineLength(points) / chord };
}

/** True when the stroke is straight enough to be straightened. */
export function isLineLike(fit: LineFit | null, cfg = QUICKSHAPE): fit is LineFit {
  if (fit === null) return false;
  if (fit.chord < cfg.minLengthPx) return false;
  if (fit.maxDeviation > Math.max(cfg.maxDeviationAbsPx, cfg.maxDeviationRel * fit.chord)) return false;
  return fit.pathRatio <= cfg.maxPathRatio;
}

/** Returns `end`, adjusted to be exactly horizontal/vertical from `start` if nearly so. */
export function snapLineEnd(start: Pt, end: Pt, toleranceDeg: number = QUICKSHAPE.angleSnapDeg): { end: Pt; snapped: 'h' | 'v' | null } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return { end, snapped: null };
  const angle = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI); // 0..180
  const fromHorizontal = Math.min(angle, 180 - angle);
  if (fromHorizontal <= toleranceDeg) return { end: { x: end.x, y: start.y }, snapped: 'h' };
  if (Math.abs(90 - angle) <= toleranceDeg) return { end: { x: start.x, y: end.y }, snapped: 'v' };
  return { end, snapped: null };
}

export interface ClosedFit {
  readonly kind: 'rect' | 'ellipse';
  readonly a: Pt;
  readonly b: Pt;
}

/**
 * Recognizes a closed, axis-aligned rectangle or ellipse. Each candidate outline is compared with
 * the stroke by mean point distance; the better one wins if it is good enough.
 */
export function fitClosed(points: readonly Pt[], cfg = QUICKSHAPE): ClosedFit | null {
  if (points.length < 8) return null;
  const box = bboxOf(points);
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const size = Math.max(w, h);
  if (size < cfg.minClosedSizePx || Math.min(w, h) < cfg.minClosedSizePx * 0.4) return null;
  if (dist(points[0], points[points.length - 1]) > cfg.closeGapRel * size) return null;
  // Must go around: path about as long as the perimeter (not a scribble back and forth).
  const perimeterish = 2 * (w + h);
  const len = polylineLength(points);
  if (len < perimeterish * 0.6 || len > perimeterish * 1.6) return null;

  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const rx = w / 2;
  const ry = h / 2;
  const halfDiag = Math.hypot(rx, ry);

  let rectErr = 0;
  let ellipseErr = 0;
  for (const p of points) {
    // Rectangle: distance to the nearest edge.
    const dx = Math.min(Math.abs(p.x - box.minX), Math.abs(p.x - box.maxX));
    const dy = Math.min(Math.abs(p.y - box.minY), Math.abs(p.y - box.maxY));
    rectErr += Math.min(dx, dy);
    // Ellipse: radial distance to the outline along the ray from the centre.
    const nx = (p.x - cx) / rx;
    const ny = (p.y - cy) / ry;
    const r = Math.hypot(nx, ny);
    const along = Math.hypot(p.x - cx, p.y - cy);
    ellipseErr += r === 0 ? halfDiag : Math.abs(along - along / r);
  }
  rectErr /= points.length * halfDiag;
  ellipseErr /= points.length * halfDiag;
  const best = rectErr <= ellipseErr ? { kind: 'rect' as const, err: rectErr } : { kind: 'ellipse' as const, err: ellipseErr };
  if (best.err > cfg.maxClosedError) return null;
  return { kind: best.kind, a: { x: box.minX, y: box.minY }, b: { x: box.maxX, y: box.maxY } };
}

/**
 * Tracks whether the pen has been held still. Jitter inside `radius` does not reset the timer;
 * moving outside re-anchors it. `anchorIndex` is the index of the stroke point where the current
 * hold began, so recognition can ignore the jittery tail recorded while holding.
 */
export class HoldTracker {
  private anchor: Pt = { x: 0, y: 0 };
  private anchorTime = 0;
  private index = 0;
  private readonly radius: number;
  private readonly durationMs: number;

  constructor(radius: number = QUICKSHAPE.holdRadiusPx, durationMs: number = QUICKSHAPE.holdMs) {
    this.radius = radius;
    this.durationMs = durationMs;
  }

  reset(p: Pt, time: number, index: number): void {
    this.anchor = { x: p.x, y: p.y };
    this.anchorTime = time;
    this.index = index;
  }

  /** Feeds a sample; returns true if it broke the hold (and re-anchored at this sample). */
  update(p: Pt, time: number, index: number): boolean {
    if (dist(p, this.anchor) > this.radius) {
      this.reset(p, time, index);
      return true;
    }
    return false;
  }

  get anchorIndex(): number {
    return this.index;
  }

  /** Time at which the hold will be satisfied if the pen does not move. */
  get dueAt(): number {
    return this.anchorTime + this.durationMs;
  }

  isHeld(now: number): boolean {
    return now >= this.dueAt;
  }
}
