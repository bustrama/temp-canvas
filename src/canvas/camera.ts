import type { Pt } from './geometry';

/**
 * The view onto the infinite canvas: screen = (world - (x, y)) * z. Screen coordinates are CSS px
 * relative to the canvas host.
 */
export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const ZOOM = { min: 0.1, max: 8 } as const;

export const IDENTITY: Camera = { x: 0, y: 0, z: 1 };

export function clampZoom(z: number): number {
  return Math.min(ZOOM.max, Math.max(ZOOM.min, z));
}

export function toWorld(cam: Camera, sx: number, sy: number): Pt {
  return { x: sx / cam.z + cam.x, y: sy / cam.z + cam.y };
}

export function toScreen(cam: Camera, wx: number, wy: number): Pt {
  return { x: (wx - cam.x) * cam.z, y: (wy - cam.y) * cam.z };
}

/** Pans by a screen-space delta (content follows the finger). */
export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { x: cam.x - dx / cam.z, y: cam.y - dy / cam.z, z: cam.z };
}

/** Zooms to `z`, keeping the world point under screen (sx, sy) in place. */
export function zoomAt(cam: Camera, z: number, sx: number, sy: number): Camera {
  const nz = clampZoom(z);
  const w = toWorld(cam, sx, sy);
  return { x: w.x - sx / nz, y: w.y - sy / nz, z: nz };
}

/** The world rect visible on a screen of the given size. */
export function visibleRect(cam: Camera, width: number, height: number): { x: number; y: number; w: number; h: number } {
  return { x: cam.x, y: cam.y, w: width / cam.z, h: height / cam.z };
}

/** Camera that shows the world rect `r` whole and centred on a screen of the given size. */
export function fitRect(r: { x: number; y: number; w: number; h: number }, width: number, height: number, margin = 0): Camera {
  const availW = Math.max(1, width - margin * 2);
  const availH = Math.max(1, height - margin * 2);
  const z = clampZoom(Math.min(availW / Math.max(r.w, 1e-6), availH / Math.max(r.h, 1e-6)));
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return { x: cx - width / 2 / z, y: cy - height / 2 / z, z };
}

/**
 * Two-finger gesture: the camera that keeps the world points first under the two fingers (at the
 * start) under their midpoint now, scaled by how far the fingers spread.
 */
export function pinch(start: Camera, startMid: Pt, startDist: number, mid: Pt, distance: number): Camera {
  const z = clampZoom(start.z * (distance / Math.max(startDist, 1)));
  const anchor = toWorld(start, startMid.x, startMid.y);
  return { x: anchor.x - mid.x / z, y: anchor.y - mid.y / z, z };
}

/** Moves `from` a fraction `t` of the way to `to` (zoom interpolated in log space). */
export function lerpCamera(from: Camera, to: Camera, t: number, width: number, height: number): Camera {
  // Interpolate the screen centre in world space so zooming looks centred.
  const fc = toWorld(from, width / 2, height / 2);
  const tc = toWorld(to, width / 2, height / 2);
  const z = Math.exp(Math.log(from.z) + (Math.log(to.z) - Math.log(from.z)) * t);
  const cx = fc.x + (tc.x - fc.x) * t;
  const cy = fc.y + (tc.y - fc.y) * t;
  return { x: cx - width / 2 / z, y: cy - height / 2 / z, z };
}

export function sameCamera(a: Camera, b: Camera, eps = 1e-3): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.z - b.z) < eps * 1e-2;
}
