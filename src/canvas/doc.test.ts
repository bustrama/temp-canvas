import { describe, expect, it } from 'vitest';
import type { Shape, StrokeShape } from '@/shared/model';
import { Doc, History } from './doc';
import { distanceToShape, hitsShape, lassoContains, shapeBounds, translateShape } from './shapes';

const stroke = (id: string, z = 1, pts = [0, 0, 0.5, 10, 0, 0.5]): StrokeShape => ({ id, z, by: 'me', kind: 'stroke', style: 'pen', color: 'ink', size: 2, pts });

describe('Doc', () => {
  it('keeps paint order by z then id', () => {
    const doc = new Doc();
    doc.apply([{ o: 'put', shape: stroke('b', 2) }, { o: 'put', shape: stroke('a', 2) }, { o: 'put', shape: stroke('c', 1) }], 'local');
    expect(doc.all().map((s) => s.id)).toEqual(['c', 'a', 'b']);
    expect(doc.maxZ()).toBe(2);
    expect(doc.minZ()).toBe(1);
  });

  it('returns inverse ops that restore the previous state', () => {
    const doc = new Doc();
    doc.apply([{ o: 'put', shape: stroke('a') }], 'local');
    const moved = translateShape(doc.get('a') as Shape, 5, 5);
    const inverse = doc.apply([{ o: 'put', shape: moved }, { o: 'del', id: 'missing' }, { o: 'put', shape: stroke('b') }], 'local');
    expect(inverse).toEqual([{ o: 'del', id: 'b' }, { o: 'put', shape: stroke('a') }]);
    doc.apply(inverse, 'local');
    expect(doc.get('a')).toEqual(stroke('a'));
    expect(doc.has('b')).toBe(false);
  });

  it('notifies listeners with the changed ids', () => {
    const doc = new Doc();
    const seen: Array<readonly string[] | null> = [];
    doc.subscribe((c) => seen.push(c.ids));
    doc.apply([{ o: 'put', shape: stroke('a') }], 'remote');
    doc.apply([{ o: 'del', id: 'nope' }], 'remote');
    doc.replaceAll([], 'load');
    expect(seen).toEqual([['a'], null]);
  });
});

describe('History', () => {
  it('undoes and redoes against the current document', () => {
    const doc = new Doc();
    const history = new History();
    const apply = (ops: Parameters<Doc['apply']>[0]) => doc.apply(ops, 'local');
    history.record(apply([{ o: 'put', shape: stroke('a') }]));
    history.record(apply([{ o: 'put', shape: stroke('b') }]));
    expect(history.undo(apply)).toBe(true);
    expect(doc.has('b')).toBe(false);
    expect(history.redo(apply)).toBe(true);
    expect(doc.has('b')).toBe(true);
    expect(history.canRedo).toBe(false);
  });

  it('skips entries the partner already made moot', () => {
    const doc = new Doc();
    const history = new History();
    const apply = (ops: Parameters<Doc['apply']>[0]) => doc.apply(ops, 'local');
    history.record(apply([{ o: 'put', shape: stroke('a') }]));
    history.record(apply([{ o: 'put', shape: stroke('b') }]));
    doc.apply([{ o: 'del', id: 'b' }], 'remote'); // partner erased my last stroke
    expect(history.undo(apply)).toBe(true); // undoes 'a' instead of doing nothing
    expect(doc.size).toBe(0);
  });

  it('clears redo on a new edit', () => {
    const doc = new Doc();
    const history = new History();
    const apply = (ops: Parameters<Doc['apply']>[0]) => doc.apply(ops, 'local');
    history.record(apply([{ o: 'put', shape: stroke('a') }]));
    history.undo(apply);
    history.record(apply([{ o: 'put', shape: stroke('c') }]));
    expect(history.canRedo).toBe(false);
  });
});

describe('shape geometry', () => {
  it('pads stroke bounds by the size', () => {
    expect(shapeBounds(stroke('a'))).toEqual({ minX: -2, minY: -2, maxX: 12, maxY: 2 });
  });

  it('measures eraser distance to the ink edge', () => {
    const s = stroke('a');
    expect(distanceToShape(s, { x: 5, y: 3 }, { x: 5, y: 3 })).toBeCloseTo(2);
    expect(distanceToShape(s, { x: 5, y: -10 }, { x: 5, y: 10 })).toBe(0);
  });

  it('hits geo outlines, not their inside', () => {
    const rect: Shape = { id: 'r', z: 1, by: 'me', kind: 'geo', geo: 'rect', style: 'pen', color: 'sky', size: 2, a: [0, 0], b: [100, 50] };
    expect(hitsShape(rect, { x: 50, y: 1 }, 3)).toBe(true);
    expect(hitsShape(rect, { x: 50, y: 25 }, 3)).toBe(false);
  });

  it('lassos shapes that are mostly inside', () => {
    const loop = [
      { x: -5, y: -5 },
      { x: 20, y: -5 },
      { x: 20, y: 5 },
      { x: -5, y: 5 },
    ];
    expect(lassoContains(stroke('a'), loop)).toBe(true);
    expect(lassoContains(stroke('b', 1, [0, 0, 0.5, 100, 0, 0.5, 200, 0, 0.5]), loop)).toBe(false);
  });

  it('translates every kind of shape', () => {
    const moved = translateShape(stroke('a'), 1.006, -2) as StrokeShape;
    expect(moved.pts).toEqual([1.01, -2, 0.5, 11.01, -2, 0.5]);
    const img: Shape = { id: 'i', z: 1, by: 'me', kind: 'image', asset: 'x', x: 0, y: 0, w: 10, h: 10 };
    expect(translateShape(img, 3, 4)).toMatchObject({ x: 3, y: 4 });
  });
});
