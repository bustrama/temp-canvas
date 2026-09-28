import { panBy, pinch, type Camera } from './camera';
import type { Pt } from './geometry';
import type { ContactInfo, PalmPolicy } from './palmPolicy';

/** What finger navigation drives (the Engine, or a fake in tests). */
export interface NavTarget {
  readonly camera: Camera;
  setCamera(cam: Camera, reason: 'user' | 'follow' | 'system'): void;
  undo(): void;
  redo(): void;
}

export const NAV = {
  panSlopPx: 4,
  tapMaxMs: 300,
  tapSlopPx: 14,
} as const;

interface Touch {
  x: number;
  y: number;
  readonly startX: number;
  readonly startY: number;
}

type Gesture =
  | { kind: 'pan'; id: number; startCam: Camera; startedAt: number; x0: number; y0: number; cam0: Camera; active: boolean }
  | { kind: 'pinch'; ids: [number, number]; startCam: Camera; startedAt: number; mid0: Pt; dist0: number; cam0: Camera };

/**
 * Finger navigation on Pointer Events: one finger pans, two fingers pinch-zoom and pan. A two-finger
 * tap undoes and a three-finger tap redoes (as in drawing apps). Palm contacts are ignored, and a
 * gesture a palm started just before the pen landed is rolled back.
 */
export class TouchNav {
  private readonly touches = new Map<number, Touch>();
  private gesture: Gesture | null = null;
  private tap: { startedAt: number; maxTouches: number; moved: boolean } | null = null;
  private readonly target: NavTarget;
  private readonly palm: PalmPolicy;

  constructor(target: NavTarget, palm: PalmPolicy) {
    this.target = target;
    this.palm = palm;
  }

  get count(): number {
    return this.touches.size;
  }

  down(id: number, c: ContactInfo, now: number): void {
    if (!this.palm.acceptTouch(id, now, c)) return;
    this.touches.set(id, { x: c.x, y: c.y, startX: c.x, startY: c.y });
    if (this.touches.size === 1) this.tap = { startedAt: now, maxTouches: 1, moved: false };
    else if (this.tap) this.tap.maxTouches = Math.max(this.tap.maxTouches, this.touches.size);
    this.regroup(now);
  }

  move(id: number, x: number, y: number): void {
    if (this.palm.isRejected(id)) {
      this.palm.moveRejected(id, x, y);
      return;
    }
    const t = this.touches.get(id);
    if (!t) return;
    t.x = x;
    t.y = y;
    if (this.tap && Math.hypot(x - t.startX, y - t.startY) > NAV.tapSlopPx) this.tap.moved = true;
    const g = this.gesture;
    if (!g) return;
    if (g.kind === 'pan' && g.id === id) {
      const dx = x - g.x0;
      const dy = y - g.y0;
      if (!g.active && Math.hypot(dx, dy) < NAV.panSlopPx) return;
      g.active = true;
      this.target.setCamera(panBy(g.cam0, dx, dy), 'user');
    } else if (g.kind === 'pinch' && g.ids.includes(id)) {
      const a = this.touches.get(g.ids[0]);
      const b = this.touches.get(g.ids[1]);
      if (!a || !b) return;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.target.setCamera(pinch(g.cam0, g.mid0, g.dist0, mid, Math.hypot(a.x - b.x, a.y - b.y)), 'user');
    }
  }

  up(id: number, now: number): void {
    if (this.palm.isRejected(id)) {
      this.palm.release(id);
      return;
    }
    if (!this.touches.delete(id)) return;
    if (this.touches.size === 0) {
      const tap = this.tap;
      this.tap = null;
      this.gesture = null;
      if (tap && !tap.moved && now - tap.startedAt <= NAV.tapMaxMs) {
        if (tap.maxTouches === 2) this.target.undo();
        else if (tap.maxTouches === 3) this.target.redo();
      }
      return;
    }
    this.regroup(now);
  }

  /** OS-cancelled touch (often a palm): drop it without triggering taps. */
  cancel(id: number, now: number): void {
    if (this.tap) this.tap.moved = true;
    this.up(id, now);
  }

  /** The pen landed: a gesture started just before is probably the palm, so undo it. */
  penLanded(now: number): void {
    const g = this.gesture;
    if (g && this.palm.shouldRollback(g.startedAt, now)) this.target.setCamera(g.startCam, 'system');
    for (const [id, t] of this.touches) this.palm.reject(id, t.x, t.y);
    this.touches.clear();
    this.gesture = null;
    this.tap = null;
  }

  reset(): void {
    this.touches.clear();
    this.gesture = null;
    this.tap = null;
  }

  /** Re-anchors the gesture on the current fingers (a finger added or lifted). */
  private regroup(now: number): void {
    const cam = this.target.camera;
    const startCam = this.gesture?.startCam ?? cam;
    const startedAt = this.gesture?.startedAt ?? now;
    const ids = [...this.touches.keys()];
    if (ids.length === 1) {
      const t = this.touches.get(ids[0]) as Touch;
      // After a pinch, the remaining finger keeps panning without a new slop.
      this.gesture = { kind: 'pan', id: ids[0], startCam, startedAt, x0: t.x, y0: t.y, cam0: cam, active: this.gesture !== null };
    } else if (ids.length >= 2) {
      const a = this.touches.get(ids[0]) as Touch;
      const b = this.touches.get(ids[1]) as Touch;
      this.gesture = {
        kind: 'pinch',
        ids: [ids[0], ids[1]],
        startCam,
        startedAt,
        mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        dist0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        cam0: cam,
      };
    } else {
      this.gesture = null;
    }
  }
}
