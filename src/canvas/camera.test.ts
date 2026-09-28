import { describe, expect, it } from 'vitest';
import { fitRect, lerpCamera, panBy, pinch, toScreen, toWorld, visibleRect, zoomAt, ZOOM } from './camera';

describe('camera', () => {
  it('round-trips between screen and world', () => {
    const cam = { x: 100, y: -50, z: 2 };
    const w = toWorld(cam, 40, 60);
    expect(w).toEqual({ x: 120, y: -20 });
    expect(toScreen(cam, w.x, w.y)).toEqual({ x: 40, y: 60 });
  });

  it('pans so content follows the pointer', () => {
    const cam = panBy({ x: 0, y: 0, z: 2 }, 20, -10);
    expect(toScreen(cam, 0, 0)).toEqual({ x: 20, y: -10 });
  });

  it('zooms around a screen point', () => {
    const cam = { x: 10, y: 20, z: 1 };
    const before = toWorld(cam, 300, 200);
    const after = zoomAt(cam, 3, 300, 200);
    expect(after.z).toBe(3);
    const w = toWorld(after, 300, 200);
    expect(w.x).toBeCloseTo(before.x);
    expect(w.y).toBeCloseTo(before.y);
  });

  it('clamps zoom', () => {
    expect(zoomAt({ x: 0, y: 0, z: 1 }, 1000, 0, 0).z).toBe(ZOOM.max);
    expect(zoomAt({ x: 0, y: 0, z: 1 }, 0.0001, 0, 0).z).toBe(ZOOM.min);
  });

  it('fits a rect centred and whole', () => {
    // A tablet view (4:3) shown on a 16:9 screen: height-limited.
    const cam = fitRect({ x: 0, y: 0, w: 1024, h: 768 }, 1920, 1080);
    expect(cam.z).toBeCloseTo(1080 / 768);
    const r = visibleRect(cam, 1920, 1080);
    expect(r.x + r.w / 2).toBeCloseTo(512);
    expect(r.y + r.h / 2).toBeCloseTo(384);
    expect(r.h).toBeCloseTo(768);
    expect(r.w).toBeGreaterThan(1024);
  });

  it('pinches: world under the fingers stays under their midpoint', () => {
    const start = { x: 0, y: 0, z: 1 };
    const cam = pinch(start, { x: 100, y: 100 }, 100, { x: 150, y: 120 }, 200);
    expect(cam.z).toBe(2);
    const w = toWorld(cam, 150, 120);
    expect(w.x).toBeCloseTo(100);
    expect(w.y).toBeCloseTo(100);
  });

  it('interpolates cameras', () => {
    const a = { x: 0, y: 0, z: 1 };
    const b = { x: 100, y: 0, z: 4 };
    expect(lerpCamera(a, b, 0, 800, 600)).toEqual(a);
    const end = lerpCamera(a, b, 1, 800, 600);
    expect(end.x).toBeCloseTo(b.x);
    expect(end.z).toBeCloseTo(b.z);
    expect(lerpCamera(a, b, 0.5, 800, 600).z).toBeCloseTo(2);
  });
});
