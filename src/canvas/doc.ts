import { compareShapes, type Op, type Shape } from '@/shared/model';

export type ChangeSource = 'local' | 'remote' | 'load';

export interface DocChange {
  readonly source: ChangeSource;
  /** Ids whose shape changed or disappeared; null when everything was replaced. */
  readonly ids: readonly string[] | null;
}

/**
 * The shapes on the canvas, keyed by id, with a paint-ordered view. Changes go through `apply`,
 * which returns the ops that undo them.
 */
export class Doc {
  private readonly shapes = new Map<string, Shape>();
  private ordered: Shape[] | null = null;
  private readonly listeners = new Set<(change: DocChange) => void>();
  private rev = 0;

  get version(): number {
    return this.rev;
  }

  get size(): number {
    return this.shapes.size;
  }

  get(id: string): Shape | undefined {
    return this.shapes.get(id);
  }

  has(id: string): boolean {
    return this.shapes.has(id);
  }

  /** All shapes in paint order. */
  all(): readonly Shape[] {
    if (!this.ordered) this.ordered = [...this.shapes.values()].sort(compareShapes);
    return this.ordered;
  }

  /** Top of the paint order (new shapes go above it). */
  maxZ(): number {
    const list = this.all();
    return list.length > 0 ? list[list.length - 1].z : 0;
  }

  minZ(): number {
    const list = this.all();
    return list.length > 0 ? list[0].z : 0;
  }

  /** Applies ops; returns the inverse ops (in the order that undoes them). */
  apply(ops: readonly Op[], source: ChangeSource): Op[] {
    const inverse: Op[] = [];
    const ids: string[] = [];
    for (const op of ops) {
      if (op.o === 'put') {
        const prev = this.shapes.get(op.shape.id);
        if (prev === op.shape) continue;
        inverse.push(prev ? { o: 'put', shape: prev } : { o: 'del', id: op.shape.id });
        this.shapes.set(op.shape.id, op.shape);
        ids.push(op.shape.id);
      } else {
        const prev = this.shapes.get(op.id);
        if (!prev) continue;
        inverse.push({ o: 'put', shape: prev });
        this.shapes.delete(op.id);
        ids.push(op.id);
      }
    }
    if (ids.length > 0) this.changed({ source, ids });
    return inverse.reverse();
  }

  replaceAll(shapes: readonly Shape[], source: ChangeSource): void {
    this.shapes.clear();
    for (const s of shapes) this.shapes.set(s.id, s);
    this.changed({ source, ids: null });
  }

  subscribe(fn: (change: DocChange) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(change: DocChange): void {
    this.rev++;
    this.ordered = null;
    for (const fn of this.listeners) fn(change);
  }
}

/**
 * Undo/redo of this device's own edits. Entries hold the ops that revert an edit; applying them
 * yields the ops for the opposite direction, computed against the document as it is by then, so
 * the partner's edits in between are respected.
 */
export class History {
  private readonly undoStack: Op[][] = [];
  private readonly redoStack: Op[][] = [];
  private readonly limit: number;

  constructor(limit = 300) {
    this.limit = limit;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  record(inverse: readonly Op[]): void {
    if (inverse.length === 0) return;
    this.undoStack.push([...inverse]);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  /** Pops the next undo; `apply` must apply the ops and return their inverse. */
  undo(apply: (ops: readonly Op[]) => Op[]): boolean {
    return this.step(this.undoStack, this.redoStack, apply);
  }

  redo(apply: (ops: readonly Op[]) => Op[]): boolean {
    return this.step(this.redoStack, this.undoStack, apply);
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  private step(from: Op[][], to: Op[][], apply: (ops: readonly Op[]) => Op[]): boolean {
    // Skip entries that no longer change anything (e.g. the partner already erased the stroke).
    while (from.length > 0) {
      const ops = from.pop() as Op[];
      const inverse = apply(ops);
      if (inverse.length > 0) {
        to.push(inverse);
        return true;
      }
    }
    return false;
  }
}
