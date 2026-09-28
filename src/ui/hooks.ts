'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { Camera } from '@/canvas/camera';
import type { EditorState, Engine } from '@/canvas/Engine';
import type { SessionController, SessionSnapshot } from '@/sync/SessionController';
import { joinUrl } from './QrCode';

const noop = () => () => {};

export function useEditorState(engine: Engine | null): EditorState | null {
  const subscribe = useCallback((fn: () => void) => (engine ? engine.subscribe(fn) : noop()), [engine]);
  return useSyncExternalStore(subscribe, () => engine?.getState() ?? null, () => null);
}

export function useSessionState(ctl: SessionController | null): SessionSnapshot | null {
  const subscribe = useCallback((fn: () => void) => (ctl ? ctl.subscribe(fn) : noop()), [ctl]);
  return useSyncExternalStore(subscribe, () => ctl?.getSnapshot() ?? null, () => null);
}

export function useCamera(engine: Engine | null): Camera | null {
  const subscribe = useCallback((fn: () => void) => (engine ? engine.subscribeCamera(fn) : noop()), [engine]);
  return useSyncExternalStore(subscribe, () => engine?.camera ?? null, () => null);
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (fn: () => void) => {
      const mq = matchMedia(query);
      mq.addEventListener('change', fn);
      return () => mq.removeEventListener('change', fn);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => matchMedia(query).matches, () => false);
}

/** Phones in either orientation: one toolbar row, and menus instead of rows of buttons. */
export function useCompact(): boolean {
  return useMediaQuery('(max-width: 639px), (max-height: 520px)');
}

/** The join URL (depends on `location`, so it is empty during server rendering). */
export function useJoinUrl(code: string): string {
  return useSyncExternalStore(noop, () => joinUrl(code), () => '');
}
