import { describe, expect, it } from 'vitest';
import type { Camera } from './camera';
import { PalmPolicy } from './palmPolicy';
import { TouchNav, type NavTarget } from './TouchNav';

class FakeTarget implements NavTarget {
  camera: Camera = { x: 0, y: 0, z: 1 };
  undos = 0;
  redos = 0;
  setCamera(cam: Camera): void {
    this.camera = cam;
  }
  undo(): void {
    this.undos++;
  }
  redo(): void {
    this.redos++;
  }
}

const finger = (x: number, y: number) => ({ x, y, width: 10, height: 10 });

describe('TouchNav', () => {
  it('pans with one finger after a small slop', () => {
    const t = new FakeTarget();
    const nav = new TouchNav(t, new PalmPolicy());
    nav.down(1, finger(100, 100), 0);
    nav.move(1, 102, 100);
    expect(t.camera.x).toBe(0);
    nav.move(1, 150, 120);
    expect(t.camera).toEqual({ x: -50, y: -20, z: 1 });
  });

  it('pinches to zoom', () => {
    const t = new FakeTarget();
    const nav = new TouchNav(t, new PalmPolicy());
    nav.down(1, finger(100, 100), 0);
    nav.down(2, finger(200, 100), 10);
    nav.move(2, 300, 100);
    expect(t.camera.z).toBeCloseTo(2);
  });

  it('undoes on a two-finger tap and redoes on a three-finger tap', () => {
    const t = new FakeTarget();
    const nav = new TouchNav(t, new PalmPolicy());
    nav.down(1, finger(100, 100), 0);
    nav.down(2, finger(200, 100), 20);
    nav.up(1, 120);
    nav.up(2, 130);
    expect(t.undos).toBe(1);
    nav.down(1, finger(100, 100), 1000);
    nav.down(2, finger(200, 100), 1010);
    nav.down(3, finger(300, 100), 1020);
    nav.up(1, 1100);
    nav.up(2, 1100);
    nav.up(3, 1110);
    expect(t.redos).toBe(1);
  });

  it('does not treat a pinch as a tap', () => {
    const t = new FakeTarget();
    const nav = new TouchNav(t, new PalmPolicy());
    nav.down(1, finger(100, 100), 0);
    nav.down(2, finger(200, 100), 10);
    nav.move(2, 260, 100);
    nav.up(1, 100);
    nav.up(2, 110);
    expect(t.undos).toBe(0);
  });

  it('rolls back a pan the palm started just before the pen landed', () => {
    const t = new FakeTarget();
    const palm = new PalmPolicy();
    const nav = new TouchNav(t, palm);
    nav.down(1, finger(100, 100), 0);
    nav.move(1, 180, 160);
    expect(t.camera.x).not.toBe(0);
    nav.penLanded(200);
    expect(t.camera).toEqual({ x: 0, y: 0, z: 1 });
    // The palm keeps resting: its moves are ignored.
    nav.move(1, 300, 300);
    expect(t.camera).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('ignores touches while the pen is down', () => {
    const t = new FakeTarget();
    const palm = new PalmPolicy();
    const nav = new TouchNav(t, palm);
    palm.penDown();
    nav.down(1, finger(100, 100), 0);
    nav.move(1, 200, 200);
    expect(t.camera.x).toBe(0);
  });
});
