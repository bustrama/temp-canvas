/** Plane geometry helpers (ported from draw-a-chart, plus a few for the infinite canvas). */

export interface Pt {
  x: number;
  y: number;
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Distance from p to segment ab. */
export function pointSegmentDistance(p: Pt, a: Pt, b: Pt): number {
  return Math.sqrt(pointSegmentDistanceSq(p.x, p.y, a.x, a.y, b.x, b.y));
}

export function pointSegmentDistanceSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

function orient(a: Pt, b: Pt, c: Pt): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

export function segmentsIntersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt): boolean {
  const d1 = orient(b1, b2, a1);
  const d2 = orient(b1, b2, a2);
  const d3 = orient(a1, a2, b1);
  const d4 = orient(a1, a2, b2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Minimum distance between segments a1a2 and b1b2 (0 if they intersect). */
export function segmentSegmentDistance(a1: Pt, a2: Pt, b1: Pt, b2: Pt): number {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    pointSegmentDistance(a1, b1, b2),
    pointSegmentDistance(a2, b1, b2),
    pointSegmentDistance(b1, a1, a2),
    pointSegmentDistance(b2, a1, a2),
  );
}

export function emptyBBox(): BBox {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function bboxOf(points: readonly Pt[]): BBox {
  const b = emptyBBox();
  for (const p of points) extendBBox(b, p.x, p.y);
  return b;
}

export function extendBBox(b: BBox, x: number, y: number): void {
  if (x < b.minX) b.minX = x;
  if (x > b.maxX) b.maxX = x;
  if (y < b.minY) b.minY = y;
  if (y > b.maxY) b.maxY = y;
}

export function unionBBox(a: BBox, b: BBox): BBox {
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}

export function padBBox(b: BBox, pad: number): BBox {
  return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
}

export function bboxesOverlap(a: BBox, b: BBox, margin = 0): boolean {
  return a.minX - margin <= b.maxX && b.minX - margin <= a.maxX && a.minY - margin <= b.maxY && b.minY - margin <= a.maxY;
}

export function pointInBBox(p: Pt, b: BBox): boolean {
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

export function polylineLength(points: readonly Pt[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i]);
  return len;
}

/** Ray-casting point-in-polygon test (polygon implicitly closed). */
export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Minimum distance from segment ab to a polyline given as flat [x, y, p, ...] triples. */
export function segmentFlatPolylineDistance(a: Pt, b: Pt, pts: readonly number[]): number {
  const n = pts.length / 3;
  if (n === 0) return Infinity;
  if (n === 1) return pointSegmentDistance({ x: pts[0], y: pts[1] }, a, b);
  let best = Infinity;
  for (let i = 1; i < n; i++) {
    const d = segmentSegmentDistance(a, b, { x: pts[(i - 1) * 3], y: pts[(i - 1) * 3 + 1] }, { x: pts[i * 3], y: pts[i * 3 + 1] });
    if (d < best) best = d;
    if (best === 0) return 0;
  }
  return best;
}

/** Minimum distance from segment ab to a box outline or inside (0 when touching/inside). */
export function segmentBoxDistance(a: Pt, b: Pt, box: BBox): number {
  if (pointInBBox(a, box) || pointInBBox(b, box)) return 0;
  const c: Pt[] = [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ];
  let best = Infinity;
  for (let i = 0; i < 4; i++) best = Math.min(best, segmentSegmentDistance(a, b, c[i], c[(i + 1) % 4]));
  return best;
}

/**
 * Indices of the points kept by Ramer-Douglas-Peucker simplification (first and last always
 * kept). Iterative, so very long strokes cannot overflow the stack.
 */
export function rdpIndices(xs: ArrayLike<number>, ys: ArrayLike<number>, tolerance: number): number[] {
  const n = xs.length;
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const tol2 = tolerance * tolerance;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop() as [number, number];
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = pointSegmentDistanceSq(xs[i], ys[i], xs[a], ys[a], xs[b], ys[b]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx > 0 && maxD > tol2) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}

/** Flat point triples simplified until at most `max` points remain (sub-pixel tolerance first). */
export function capFlatPoints(pts: readonly number[], max: number, tolerances: readonly number[]): number[] {
  const n = pts.length / 3;
  if (n <= max) return pts.slice();
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = pts[i * 3];
    ys[i] = pts[i * 3 + 1];
  }
  let kept: number[] = [];
  for (const tol of tolerances) {
    kept = rdpIndices(xs, ys, tol);
    if (kept.length <= max) break;
  }
  if (kept.length > max) {
    const step = Math.ceil(kept.length / max);
    kept = kept.filter((_, i) => i % step === 0 || i === kept.length - 1);
  }
  const out: number[] = [];
  for (const i of kept) out.push(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
  return out;
}

/** Round to a fixed number of decimals (keeps the wire format compact). */
export function round(v: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}
