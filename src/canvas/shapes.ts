import type { GeoShape, Shape } from '@/shared/model';
import {
  bboxOf,
  emptyBBox,
  extendBBox,
  padBBox,
  pointInBBox,
  pointInPolygon,
  segmentBoxDistance,
  segmentFlatPolylineDistance,
  segmentSegmentDistance,
  type BBox,
  type Pt,
} from './geometry';

/** Geometry of stored shapes in world units: bounds, hit testing, lasso sampling, moves. */

export const TEXT_LINE_HEIGHT = 1.25;

/** Measures a line of text at font size 1 (the renderer installs a canvas-backed measurer). */
let measureLine: (line: string) => number = (line) => line.length * 0.55;

export function setTextMeasurer(fn: (line: string) => number): void {
  measureLine = fn;
  boundsCache = new WeakMap();
}

let boundsCache = new WeakMap<Shape, BBox>();

/** World bounds, padded by the stroke width. Cached per (immutable) shape object. */
export function shapeBounds(s: Shape): BBox {
  let b = boundsCache.get(s);
  if (b) return b;
  switch (s.kind) {
    case 'stroke': {
      b = emptyBBox();
      for (let i = 0; i < s.pts.length; i += 3) extendBBox(b, s.pts[i], s.pts[i + 1]);
      b = padBBox(b, s.size);
      break;
    }
    case 'geo': {
      const pad = s.geo === 'arrow' ? s.size * 5 : s.size;
      b = padBBox(bboxOf([toPt(s.a), toPt(s.b)]), pad);
      break;
    }
    case 'text': {
      const lines = s.text.split('\n');
      const w = Math.max(s.fontSize * 0.5, ...lines.map((l) => measureLine(l) * s.fontSize));
      b = { minX: s.x, minY: s.y, maxX: s.x + w, maxY: s.y + lines.length * s.fontSize * TEXT_LINE_HEIGHT };
      break;
    }
    case 'image':
      b = { minX: s.x, minY: s.y, maxX: s.x + s.w, maxY: s.y + s.h };
      break;
  }
  boundsCache.set(s, b);
  return b;
}

/** Distance from the segment ab (e.g. one eraser step) to the shape's ink, in world units. */
export function distanceToShape(s: Shape, a: Pt, b: Pt): number {
  switch (s.kind) {
    case 'stroke':
      return Math.max(0, segmentFlatPolylineDistance(a, b, s.pts) - s.size / 2);
    case 'geo':
      return Math.max(0, geoDistance(s, a, b) - s.size / 2);
    case 'text':
    case 'image':
      return segmentBoxDistance(a, b, shapeBounds(s));
  }
}

function geoDistance(s: GeoShape, a: Pt, b: Pt): number {
  const outline = geoOutline(s);
  let best = Infinity;
  for (let i = 1; i < outline.length; i++) best = Math.min(best, segmentSegmentDistance(a, b, outline[i - 1], outline[i]));
  return best;
}

/** The polyline a geo shape draws (ellipses sampled). */
export function geoOutline(s: GeoShape): Pt[] {
  const [ax, ay] = s.a;
  const [bx, by] = s.b;
  if (s.geo === 'line' || s.geo === 'arrow') return [{ x: ax, y: ay }, { x: bx, y: by }];
  const minX = Math.min(ax, bx);
  const maxX = Math.max(ax, bx);
  const minY = Math.min(ay, by);
  const maxY = Math.max(ay, by);
  if (s.geo === 'rect') {
    return [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
      { x: minX, y: minY },
    ];
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = (maxX - minX) / 2;
  const ry = (maxY - minY) / 2;
  const n = 48;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry };
  });
}

/** Points that stand for the shape when testing it against a lasso. */
export function samplePoints(s: Shape): Pt[] {
  switch (s.kind) {
    case 'stroke': {
      const out: Pt[] = [];
      const n = s.pts.length / 3;
      const step = Math.max(1, Math.floor(n / 64));
      for (let i = 0; i < n; i += step) out.push({ x: s.pts[i * 3], y: s.pts[i * 3 + 1] });
      return out;
    }
    case 'geo':
      return geoOutline(s);
    case 'text':
    case 'image': {
      const b = shapeBounds(s);
      return [
        { x: b.minX, y: b.minY },
        { x: b.maxX, y: b.minY },
        { x: b.maxX, y: b.maxY },
        { x: b.minX, y: b.maxY },
        { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
      ];
    }
  }
}

/** A shape is lassoed when most of it lies inside the loop. */
export function lassoContains(s: Shape, lasso: readonly Pt[]): boolean {
  const pts = samplePoints(s);
  if (pts.length === 0) return false;
  let inside = 0;
  for (const p of pts) if (pointInPolygon(p, lasso)) inside++;
  return inside / pts.length >= 0.6;
}

/** Whether a tap at `p` (with tolerance in world units) hits the shape. */
export function hitsShape(s: Shape, p: Pt, tolerance: number): boolean {
  if (s.kind === 'image' || s.kind === 'text') return pointInBBox(p, padBBox(shapeBounds(s), tolerance));
  return distanceToShape(s, p, p) <= tolerance;
}

export function translateShape(s: Shape, dx: number, dy: number): Shape {
  switch (s.kind) {
    case 'stroke': {
      const pts = s.pts.slice();
      for (let i = 0; i < pts.length; i += 3) {
        pts[i] = r2(pts[i] + dx);
        pts[i + 1] = r2(pts[i + 1] + dy);
      }
      return { ...s, pts };
    }
    case 'geo':
      return { ...s, a: [r2(s.a[0] + dx), r2(s.a[1] + dy)], b: [r2(s.b[0] + dx), r2(s.b[1] + dy)] };
    case 'text':
    case 'image':
      return { ...s, x: r2(s.x + dx), y: r2(s.y + dy) };
  }
}

function toPt(p: readonly [number, number]): Pt {
  return { x: p[0], y: p[1] };
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
