import { isOp, isRecord, isShape, type AssetMeta, type InkColor, type Op, type Shape } from './model';

/**
 * Wire protocol between a browser and the relay (a Cloudflare Durable Object per invite code).
 *
 * - Committed changes (`ops`) are applied by the relay, acknowledged, and forwarded to the others.
 * - Ephemeral traffic (`live` strokes in progress, `pres` cursors/viewports, `cmd`) is forwarded
 *   only, never stored.
 * - A frame may carry one message or an array of them (clients batch per ~30 ms).
 * The relay keeps state in memory only; nothing outlives the session.
 */

export type JoinMode = 'create' | 'join' | 'resume';
export type DeviceKind = 'pen' | 'desktop';

/** People in one session at most. */
export const MAX_MEMBERS = 5;

/**
 * Each member gets the lowest free slot when joining; the slot picks their cursor colour and name,
 * so every device shows the same person in the same colour.
 */
export const PEER_COLORS = ['rose', 'sky', 'mint', 'peach', 'lilac'] as const satisfies readonly InkColor[];
export type PeerColor = (typeof PEER_COLORS)[number];

export const CLOSE = {
  badRequest: 4000,
  full: 4001,
  forbidden: 4003,
  notFound: 4004,
  idle: 4008,
  taken: 4009,
  ended: 4010,
  replaced: 4011,
} as const;
export type CloseCode = (typeof CLOSE)[keyof typeof CLOSE];

// ---- ephemeral payloads (opaque to the relay) --------------------------------------------------

export type LiveStyle = 'pen' | 'highlighter' | 'laser';

export type LiveEvent =
  | { readonly k: 'begin'; readonly id: string; readonly style: LiveStyle; readonly color: InkColor; readonly size: number; readonly pts: readonly number[] }
  | { readonly k: 'pts'; readonly id: string; readonly pts: readonly number[] }
  /** Stroke finished. Pen/highlighter ghosts stay until the committed shape arrives; laser fades. */
  | { readonly k: 'end'; readonly id: string; readonly keep: boolean }
  /** A shape-like preview (dragged geometry, snapped quick-shape, text being typed); null removes it. */
  | { readonly k: 'ghost'; readonly id: string; readonly shape: Shape | null }
  /** Selection being moved: shapes drawn offset by (dx, dy) until the committed move arrives. */
  | { readonly k: 'xf'; readonly ids: readonly string[]; readonly dx: number; readonly dy: number }
  /** Shapes hidden while an eraser stroke is still going. */
  | { readonly k: 'hide'; readonly ids: readonly string[] };

export interface Presence {
  /** Hovering or drawing pointer in world coords, or null when it left the canvas. */
  readonly cursor: readonly [number, number] | null;
  readonly pointer: 'pen' | 'mouse' | 'touch' | null;
  /** The world rect the device is looking at (for follow mode and the viewport outlines). */
  readonly view: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly tool: string;
  readonly color: InkColor;
  /** Id of the member whose view this device follows, if any. */
  readonly following?: string | null;
}

export type Command = { readonly k: 'snapshot-request' } | { readonly k: 'snapshot-unavailable' };

export interface PeerInfo {
  readonly id: string;
  readonly device: DeviceKind;
  /** Index into PEER_COLORS. */
  readonly slot: number;
  readonly pres: Presence | null;
}

// ---- messages ----------------------------------------------------------------------------------

export type ClientMessage =
  | { readonly t: 'ops'; readonly seq: number; readonly ops: readonly Op[] }
  | { readonly t: 'seed'; readonly shapes: readonly Shape[] }
  | { readonly t: 'live'; readonly e: LiveEvent }
  | { readonly t: 'pres'; readonly p: Presence }
  /** `to`: one member only; otherwise everyone else. */
  | { readonly t: 'cmd'; readonly c: Command; readonly to?: string }
  | AssetChunk
  | { readonly t: 'want'; readonly ids: readonly string[] }
  | { readonly t: 'ping' }
  | { readonly t: 'end' };

export type ServerMessage =
  | { readonly t: 'welcome'; readonly you: string; readonly slot: number; readonly fresh: boolean; readonly peers: readonly PeerInfo[]; readonly assets: readonly AssetMeta[] }
  /** The room's shapes, in batches; `last` marks the end of the initial sync. */
  | { readonly t: 'shapes'; readonly shapes: readonly Shape[]; readonly last: boolean }
  | { readonly t: 'ack'; readonly seq: number }
  | { readonly t: 'ops'; readonly ops: readonly Op[] }
  | { readonly t: 'live'; readonly from: string; readonly e: LiveEvent }
  | { readonly t: 'pres'; readonly from: string; readonly p: Presence }
  | { readonly t: 'cmd'; readonly from: string; readonly c: Command }
  | { readonly t: 'peer'; readonly peer: PeerInfo; readonly on: boolean }
  | { readonly t: 'asset-meta'; readonly asset: AssetMeta }
  | AssetChunk
  | { readonly t: 'pong' }
  | { readonly t: 'ended' }
  | { readonly t: 'err'; readonly code: CloseCode; readonly message: string };

export interface AssetChunk {
  readonly t: 'asset';
  readonly meta: AssetMeta;
  /** Chunk index and count; `data` is a slice of the base64 payload. */
  readonly i: number;
  readonly n: number;
  readonly data: string;
}

// ---- relay-side validation ---------------------------------------------------------------------

/** Parses one frame into client messages; invalid entries are dropped. */
export function parseClientFrame(raw: string): ClientMessage[] {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = Array.isArray(value) ? value : [value];
  const out: ClientMessage[] = [];
  for (const item of list) {
    const msg = toClientMessage(item);
    if (msg) out.push(msg);
  }
  return out;
}

function toClientMessage(v: unknown): ClientMessage | null {
  if (!isRecord(v)) return null;
  switch (v.t) {
    case 'ops':
      if (typeof v.seq !== 'number' || !Array.isArray(v.ops) || !v.ops.every(isOp)) return null;
      return { t: 'ops', seq: v.seq, ops: v.ops as Op[] };
    case 'seed':
      if (!Array.isArray(v.shapes) || !v.shapes.every(isShape)) return null;
      return { t: 'seed', shapes: v.shapes as Shape[] };
    case 'live':
      return isRecord(v.e) && typeof v.e.k === 'string' ? { t: 'live', e: v.e as unknown as LiveEvent } : null;
    case 'pres':
      return isRecord(v.p) ? { t: 'pres', p: v.p as unknown as Presence } : null;
    case 'cmd':
      if (!isRecord(v.c) || typeof v.c.k !== 'string') return null;
      return typeof v.to === 'string' ? { t: 'cmd', c: v.c as unknown as Command, to: v.to } : { t: 'cmd', c: v.c as unknown as Command };
    case 'asset':
      return isAssetChunk(v) ? (v as unknown as AssetChunk) : null;
    case 'want':
      return Array.isArray(v.ids) && v.ids.every((id) => typeof id === 'string') ? { t: 'want', ids: v.ids as string[] } : null;
    case 'ping':
      return { t: 'ping' };
    case 'end':
      return { t: 'end' };
    default:
      return null;
  }
}

function isAssetChunk(v: Record<string, unknown>): boolean {
  const m = v.meta;
  return (
    isRecord(m) &&
    typeof m.id === 'string' &&
    m.id.length > 0 &&
    m.id.length <= 64 &&
    typeof m.mime === 'string' &&
    /^image\/(png|jpeg|webp|gif)$/.test(m.mime) &&
    typeof m.w === 'number' &&
    typeof m.h === 'number' &&
    Number.isInteger(v.i) &&
    Number.isInteger(v.n) &&
    (v.n as number) > 0 &&
    (v.i as number) >= 0 &&
    (v.i as number) < (v.n as number) &&
    typeof v.data === 'string'
  );
}

/** Parses a server frame on the client (trusted source, light checks only). */
export function parseServerFrame(raw: string): ServerMessage[] {
  try {
    const value: unknown = JSON.parse(raw);
    const list = Array.isArray(value) ? value : [value];
    return list.filter((m): m is ServerMessage => isRecord(m) && typeof m.t === 'string');
  } catch {
    return [];
  }
}
