import { describe, expect, it } from 'vitest';
import type { Pt } from './geometry';
import { fitClosed, fitLine, HoldTracker, isLineLike, snapLineEnd } from './quickShape';

const wobble = (i: number) => Math.sin(i * 1.7) * 1.5;

function line(n = 40): Pt[] {
  return Array.from({ length: n }, (_, i) => ({ x: i * 5, y: 100 + wobble(i) }));
}

function ellipse(cx: number, cy: number, rx: number, ry: number, n = 60, close = 1): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / (n - 1)) * Math.PI * 2 * close;
    return { x: cx + Math.cos(a) * rx + wobble(i), y: cy + Math.sin(a) * ry + wobble(i + 3) };
  });
}

function rect(x: number, y: number, w: number, h: number, perSide = 15): Pt[] {
  const out: Pt[] = [];
  const corners = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ];
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < perSide; i++) {
      const t = i / perSide;
      out.push({ x: corners[s][0] + (corners[s + 1][0] - corners[s][0]) * t + wobble(i), y: corners[s][1] + (corners[s + 1][1] - corners[s][1]) * t + wobble(i + 1) });
    }
  }
  out.push({ x, y: y + 2 });
  return out;
}

describe('quick shapes', () => {
  it('recognizes a wobbly straight line', () => {
    expect(isLineLike(fitLine(line()))).toBe(true);
  });

  it('rejects a curve as a line', () => {
    const arc = Array.from({ length: 40 }, (_, i) => ({ x: i * 5, y: 100 + ((i - 20) ** 2) / 4 }));
    expect(isLineLike(fitLine(arc))).toBe(false);
  });

  it('snaps near-horizontal and near-vertical lines', () => {
    expect(snapLineEnd({ x: 0, y: 0 }, { x: 100, y: 3 })).toEqual({ end: { x: 100, y: 0 }, snapped: 'h' });
    expect(snapLineEnd({ x: 0, y: 0 }, { x: 2, y: 100 })).toEqual({ end: { x: 0, y: 100 }, snapped: 'v' });
    expect(snapLineEnd({ x: 0, y: 0 }, { x: 100, y: 50 }).snapped).toBeNull();
  });

  it('recognizes a hand-drawn ellipse', () => {
    const fit = fitClosed(ellipse(200, 150, 120, 70));
    expect(fit?.kind).toBe('ellipse');
    expect(fit?.a.x).toBeCloseTo(80, -1);
    expect(fit?.b.y).toBeCloseTo(220, -1);
  });

  it('recognizes a hand-drawn rectangle', () => {
    expect(fitClosed(rect(50, 50, 200, 120))?.kind).toBe('rect');
  });

  it('ignores open curves and tiny loops', () => {
    expect(fitClosed(ellipse(200, 150, 120, 70, 60, 0.6))).toBeNull();
    expect(fitClosed(ellipse(10, 10, 8, 8))).toBeNull();
  });

  it('ignores scribbles that are not an outline', () => {
    const zigzag = Array.from({ length: 60 }, (_, i) => ({ x: (i % 2) * 150, y: i * 3 }));
    expect(fitClosed([...zigzag, zigzag[0]])).toBeNull();
  });

  it('tracks a pen held still', () => {
    const hold = new HoldTracker(5, 400);
    hold.reset({ x: 0, y: 0 }, 0, 0);
    expect(hold.update({ x: 2, y: 2 }, 100, 1)).toBe(false);
    expect(hold.isHeld(399)).toBe(false);
    expect(hold.isHeld(400)).toBe(true);
    expect(hold.update({ x: 20, y: 0 }, 450, 2)).toBe(true);
    expect(hold.anchorIndex).toBe(2);
    expect(hold.dueAt).toBe(850);
  });
});
