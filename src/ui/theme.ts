'use client';

import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'tc:theme';
const EVENT = 'tc:theme';

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** Switches theme for this browser (a per-viewer preference, so localStorage is fine). */
export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // storage unavailable: the choice lasts for this page only
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  // Follow the system while the user has not picked a theme.
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onSystem = () => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      // ignore
    }
    if (saved !== 'light' && saved !== 'dark') {
      document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light';
      fn();
    }
  };
  mq.addEventListener('change', onSystem);
  return () => {
    window.removeEventListener(EVENT, fn);
    mq.removeEventListener('change', onSystem);
  };
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => 'light');
}

export function subscribeTheme(fn: () => void): () => void {
  return subscribe(fn);
}
