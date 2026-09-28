/**
 * The canvas document: a flat set of shapes in world coordinates. At zoom 1, one world unit is one
 * CSS pixel. Sizes are stored in world units, so a stroke keeps the thickness it had on screen when
 * it was drawn and scales with the canvas afterwards.
 */

/** Ink colours are tokens, not hex: each theme maps them, so light and dark both read well. */
export const INK_COLORS = ['ink', 'rose', 'peach', 'lemon', 'mint', 'sky', 'lilac'] as const;
export type InkColor = (typeof INK_COLORS)[number];

export type StrokeStyle = 'pen' | 'highlighter';
export type GeoKind = 'line' | 'arrow' | 'rect' | 'ellipse';

interface ShapeBase {
  readonly id: string;
  /** Paint order: lower first. Creation time plus a tiebreak keeps both devices in the same order. */
  readonly z: number;
  /** Client id of the author (undo only touches your own work; the UI can tint by author). */
  readonly by: string;
}

export interface StrokeShape extends ShapeBase {
  readonly kind: 'stroke';
  readonly style: StrokeStyle;
  readonly color: InkColor;
  readonly size: number;
  /** Flat [x, y, pressure, x, y, pressure, ...] in world units, pressure 0..1. */
  readonly pts: readonly number[];
}

export interface GeoShape extends ShapeBase {
  readonly kind: 'geo';
  readonly geo: GeoKind;
  readonly style: StrokeStyle;
  readonly color: InkColor;
  readonly size: number;
  /** line/arrow: from a to b. rect/ellipse: a and b are opposite corners. */
  readonly a: readonly [number, number];
  readonly b: readonly [number, number];
}

export interface TextShape extends ShapeBase {
  readonly kind: 'text';
  readonly color: InkColor;
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
  readonly text: string;
}

export interface ImageShape extends ShapeBase {
  readonly kind: 'image';
  readonly asset: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Screen snapshots are locked: the pen writes on them instead of selecting them. */
  readonly locked?: boolean;
}

export type Shape = StrokeShape | GeoShape | TextShape | ImageShape;

/** A committed change. `put` is an upsert of the whole shape, so replaying ops is idempotent. */
export type Op = { readonly o: 'put'; readonly shape: Shape } | { readonly o: 'del'; readonly id: string };

/** Binary payloads (pasted images, screen snapshots), shared once and referenced by id. */
export interface AssetMeta {
  readonly id: string;
  readonly mime: string;
  readonly w: number;
  readonly h: number;
}

export const LIMITS = {
  maxShapes: 20_000,
  maxStrokePoints: 4_000,
  maxTextLength: 4_000,
  maxAssetBytes: 4 * 1024 * 1024,
  maxRoomAssetBytes: 32 * 1024 * 1024,
  /** Asset payloads travel as base64 in chunks of this many characters. */
  assetChunkChars: 60_000,
  maxMessageChars: 1_000_000,
} as const;

export function isShape(value: unknown): value is Shape {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || value.id.length === 0 || value.id.length > 64) return false;
  if (!isFiniteNumber(value.z) || typeof value.by !== 'string' || value.by.length > 64) return false;
  switch (value.kind) {
    case 'stroke':
      return (
        isStrokeStyle(value.style) &&
        isInkColor(value.color) &&
        isPositive(value.size) &&
        Array.isArray(value.pts) &&
        value.pts.length >= 3 &&
        value.pts.length % 3 === 0 &&
        value.pts.length <= LIMITS.maxStrokePoints * 3 &&
        value.pts.every(isFiniteNumber)
      );
    case 'geo':
      return (
        (value.geo === 'line' || value.geo === 'arrow' || value.geo === 'rect' || value.geo === 'ellipse') &&
        isStrokeStyle(value.style) &&
        isInkColor(value.color) &&
        isPositive(value.size) &&
        isPair(value.a) &&
        isPair(value.b)
      );
    case 'text':
      return (
        isInkColor(value.color) &&
        isFiniteNumber(value.x) &&
        isFiniteNumber(value.y) &&
        isPositive(value.fontSize) &&
        typeof value.text === 'string' &&
        value.text.length <= LIMITS.maxTextLength
      );
    case 'image':
      return (
        typeof value.asset === 'string' &&
        value.asset.length > 0 &&
        value.asset.length <= 64 &&
        isFiniteNumber(value.x) &&
        isFiniteNumber(value.y) &&
        isPositive(value.w) &&
        isPositive(value.h) &&
        (value.locked === undefined || typeof value.locked === 'boolean')
      );
    default:
      return false;
  }
}

export function isOp(value: unknown): value is Op {
  if (!isRecord(value)) return false;
  if (value.o === 'put') return isShape(value.shape);
  if (value.o === 'del') return typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 64;
  return false;
}

export function isInkColor(value: unknown): value is InkColor {
  return typeof value === 'string' && (INK_COLORS as readonly string[]).includes(value);
}

function isStrokeStyle(value: unknown): value is StrokeStyle {
  return value === 'pen' || value === 'highlighter';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositive(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isPair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && isFiniteNumber(value[0]) && isFiniteNumber(value[1]);
}

/** Paint order comparator: by z, then id so every device agrees on ties. */
export function compareShapes(a: Shape, b: Shape): number {
  return a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
