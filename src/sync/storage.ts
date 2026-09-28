import { randomId } from '@/shared/code';
import { isShape, type AssetMeta, type Shape } from '@/shared/model';
import type { Camera } from '@/canvas/camera';

/**
 * Per-tab memory. sessionStorage survives a refresh but is erased when the tab is closed, which is
 * exactly the lifetime a session copy should have: a lone device can refresh without losing the
 * drawing, and nothing is left behind afterwards.
 */

const CLIENT_KEY = 'tc:cid';
const sessionKey = (code: string) => `tc:session:${code}`;
const intentKey = (code: string) => `tc:intent:${code}`;

export interface SavedSession {
  readonly v: 1;
  readonly code: string;
  readonly shapes: readonly Shape[];
  readonly assets: ReadonlyArray<{ meta: AssetMeta; data: string }>;
  readonly camera: Camera | null;
  readonly slot?: number;
}

/** This tab's identity for the relay (stable across refreshes of the tab). */
export function tabClientId(): string {
  const existing = read(CLIENT_KEY);
  if (existing && /^[0-9a-z]{16}$/.test(existing)) return existing;
  const id = randomId(16);
  write(CLIENT_KEY, id);
  return id;
}

export function loadSession(code: string): SavedSession | null {
  const raw = read(sessionKey(code));
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as SavedSession;
    if (v.v !== 1 || v.code !== code || !Array.isArray(v.shapes)) return null;
    return { ...v, shapes: v.shapes.filter(isShape), assets: Array.isArray(v.assets) ? v.assets : [] };
  } catch {
    return null;
  }
}

/** Saves the session; if images do not fit the storage quota, keeps the shapes without them. */
export function saveSession(s: SavedSession): void {
  if (write(sessionKey(s.code), JSON.stringify(s))) return;
  write(sessionKey(s.code), JSON.stringify({ ...s, assets: [] }));
}

export function clearSession(code: string): void {
  try {
    sessionStorage.removeItem(sessionKey(code));
    sessionStorage.removeItem(intentKey(code));
  } catch {
    // storage unavailable
  }
}

/** The home screen marks a code it just generated so the session page creates the room. */
export function markCreating(code: string): void {
  write(intentKey(code), 'create');
}

export function isCreating(code: string): boolean {
  return read(intentKey(code)) === 'create';
}

export function clearCreating(code: string): void {
  try {
    sessionStorage.removeItem(intentKey(code));
  } catch {
    // storage unavailable
  }
}

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): boolean {
  try {
    sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
