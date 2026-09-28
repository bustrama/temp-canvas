import { getStroke } from 'perfect-freehand';
import { Easing, interpolate, random } from 'remotion';

/** Pen strokes for the video: the same perfect-freehand settings as the app (src/canvas/render.ts). */

export type Pt = [number, number];
/** x, y, pressure */
export type PPt = [number, number, number];

export const PEN = { thinning: 0.55, smoothing: 0.5, streamline: 0.3 };
export const HIGHLIGHTER = { thinning: 0, smoothing: 0.6, streamline: 0.4 };

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Catmull-Rom curve through the control points. */
export function spline(ctrl: Pt[], closed = false): Pt[] {
  const n = ctrl.length;
  if (n < 3) return ctrl;
  const at = (i: number) => (closed ? ctrl[(i + n) % n] : ctrl[Math.max(0, Math.min(n - 1, i))]);
  const out: Pt[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k < 24; k++) {
      const t = k / 24;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(closed ? ctrl[0] : ctrl[n - 1]);
  return out;
}

/** Points every `spacing` px along the polyline. */
export function resample(pts: Pt[], spacing = 3): Pt[] {
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = len[len.length - 1];
  const out: Pt[] = [];
  let j = 1;
  for (let s = 0; s < total; s += spacing) {
    while (j < pts.length - 1 && len[j] < s) j++;
    const t = (s - len[j - 1]) / (len[j] - len[j - 1] || 1);
    out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * t, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * t]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** A natural pen pressure curve: light touch-down, a little variation, light lift-off. */
export function pressure(pts: Pt[], seed = 1): PPt[] {
  const n = pts.length;
  const phase = random(seed) * Math.PI * 2;
  return pts.map(([x, y], i) => {
    const s = n > 1 ? i / (n - 1) : 0;
    const ramp = Math.min(1, s / 0.08, (1 - s) / 0.14);
    const p = 0.22 + 0.36 * Math.max(0, ramp) + 0.08 * Math.sin(s * Math.PI * 3 + phase);
    return [x, y, p];
  });
}

/** Control points → dense pen points with pressure. */
export function pen(ctrl: Pt[], seed = 1, closed = false): PPt[] {
  return pressure(resample(spline(ctrl, closed)), seed);
}

/** A hand-drawn loop around a point: overshoots its start and doesn't quite close. */
export function loop(cx: number, cy: number, rx: number, ry: number, seed = 1, start = -2.2): PPt[] {
  const pts: Pt[] = [];
  const sweep = Math.PI * 2 + 0.45;
  const wob = random(seed) * 6;
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    const a = start + t * sweep;
    const shrink = 1 - 0.07 * t;
    const w = 1 + 0.035 * Math.sin(a * 2 + wob);
    pts.push([cx + Math.cos(a) * rx * shrink * w, cy + Math.sin(a) * ry * shrink * w]);
  }
  return pressure(resample(pts), seed);
}

/** Cursive loops ("eeee"): heavier on the down strokes, which shows off pressure. */
export function cursive(x: number, y: number, count: number, advance: number, r: number): PPt[] {
  const out: PPt[] = [];
  const a = advance / (Math.PI * 2);
  const steps = count * 90;
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * count * Math.PI * 2 - Math.PI / 2;
    const s = i / steps;
    const ramp = Math.min(1, s / 0.04, (1 - s) / 0.06);
    const p = (0.18 + 0.62 * Math.max(0, (Math.sin(th) + 1) / 2)) * Math.max(0.2, ramp);
    out.push([x + a * th - r * Math.sin(th) * 0.9, y - r * Math.cos(th), p]);
  }
  const dense = resample(out.map(([px, py]) => [px, py]), 2.5);
  // Carry pressure over by nearest source index (both are in order along the curve).
  return dense.map(([px, py], i) => [px, py, out[Math.round((i / (dense.length - 1)) * (out.length - 1))][2]]);
}

/** Straight segments through the points (sharp corners), with pen pressure. */
export function lines(ctrl: Pt[], seed = 1): PPt[] {
  return pressure(resample(ctrl), seed);
}

/** Control points around an ellipse, starting at angle `start` and sweeping `sweep` radians. */
export function ellipseCtrl(cx: number, cy: number, rx: number, ry: number, start = -2.2, sweep = Math.PI * 2 + 0.4, n = 14): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = start + (i / n) * sweep;
    const k = 1 - 0.06 * (i / n);
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k] as Pt;
  });
}

/** The two barbs of an arrow head at `tip`, pointing away from `from`: wing, tip, wing. */
export function arrowHead(tip: Pt, from: Pt, len = 40, angle = 0.5): Pt[] {
  const d = Math.hypot(tip[0] - from[0], tip[1] - from[1]) || 1;
  const bx = (from[0] - tip[0]) / d;
  const by = (from[1] - tip[1]) / d;
  const rot = (a: number): Pt => [tip[0] + (bx * Math.cos(a) - by * Math.sin(a)) * len, tip[1] + (bx * Math.sin(a) + by * Math.cos(a)) * len];
  return [rot(angle), tip, rot(-angle)];
}

/** Uniform-width, jittery points: what a mouse drawing looks like. */
export function jitter(ctrl: Pt[], seed: number, amp = 5, closed = false): Pt[] {
  const pts = resample(spline(ctrl, closed), 9);
  return pts.map(([x, y], i) => {
    const drift = Math.sin(i * 0.35 + seed) * amp * 0.6;
    return [x + (random(`${seed}x${i}`) - 0.5) * amp + drift, y + (random(`${seed}y${i}`) - 0.5) * amp - drift * 0.5];
  });
}

/** SVG path for a perfect-freehand outline (from the perfect-freehand README). */
export function outlinePath(points: number[][]): string {
  const len = points.length;
  if (len < 4) return '';
  const avg = (a: number, b: number) => (a + b) / 2;
  let a = points[0];
  let b = points[1];
  const c = points[2];
  let d = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${avg(b[0], c[0]).toFixed(2)},${avg(b[1], c[1]).toFixed(2)} T`;
  for (let i = 2; i < len - 1; i++) {
    a = points[i];
    b = points[i + 1];
    d += `${avg(a[0], b[0]).toFixed(2)},${avg(a[1], b[1]).toFixed(2)} `;
  }
  return `${d}Z`;
}

export function strokePath(pts: PPt[], size: number, done: boolean, highlighter = false): string {
  if (pts.length === 0) return '';
  return outlinePath(getStroke(pts, { size, ...(highlighter ? HIGHLIGHTER : PEN), simulatePressure: false, last: done }));
}

/** The first `progress` of a stroke (at least one point). */
export function take<T>(pts: T[], progress: number): T[] {
  return pts.slice(0, Math.max(1, Math.round(progress * pts.length)));
}

/** A stroke drawn over time. */
export interface Stroke {
  pts: PPt[];
  from: number;
  dur: number;
  color: string;
  size?: number;
  highlighter?: boolean;
}

export function progressOf(frame: number, s: { from: number; dur: number }): number {
  return interpolate(frame, [s.from, s.from + s.dur], [0, 1], { ...clamp, easing: Easing.bezier(0.37, 0, 0.63, 1) });
}

/** Where the pen tip is, and how far it is lifted (0 = on the glass), for a list of strokes drawn in order. */
export function penAt(frame: number, strokes: Array<{ pts: Pt[] | PPt[]; from: number; dur: number }>, rest: Pt): { x: number; y: number; lift: number } {
  const tip = (s: (typeof strokes)[number], p: number) => {
    const t = take(s.pts as Pt[], p);
    return t[t.length - 1];
  };
  let prevEnd: Pt = rest;
  let prevTime = -Infinity;
  for (const s of strokes) {
    if (frame < s.from) {
      const start = s.pts[0] as Pt;
      const gap = s.from - prevTime;
      const travel = Math.min(gap, 16);
      const t = interpolate(frame, [s.from - travel, s.from], [0, 1], { ...clamp, easing: Easing.bezier(0.45, 0, 0.2, 1) });
      const lift = prevTime === -Infinity ? Math.max(0.15, 1 - t) : Math.sin(Math.PI * t) * Math.min(1, gap / 10) * 0.8 + (t < 1 ? 0.05 : 0);
      return { x: prevEnd[0] + (start[0] - prevEnd[0]) * t, y: prevEnd[1] + (start[1] - prevEnd[1]) * t, lift: t >= 1 ? 0 : lift };
    }
    if (frame <= s.from + s.dur) {
      const [x, y] = tip(s, progressOf(frame, s));
      return { x, y, lift: 0 };
    }
    prevEnd = tip(s, 1);
    prevTime = s.from + s.dur;
  }
  if (prevTime === -Infinity) return { x: rest[0], y: rest[1], lift: 1 };
  const t =interpolate(frame, [prevTime, prevTime + 12], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  return { x: prevEnd[0] + 30 * t, y: prevEnd[1] + 20 * t, lift: t };
}
