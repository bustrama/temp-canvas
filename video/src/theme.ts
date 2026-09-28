import type { CSSProperties } from 'react';
import { loadFont as loadCaveat } from '@remotion/google-fonts/Caveat';
import { loadFont as loadGeist } from '@remotion/google-fonts/Geist';
import { loadFont as loadGeistMono } from '@remotion/google-fonts/GeistMono';

/** The app's dark theme (src/app/globals.css), so the video looks like the product. */

export const sans = loadGeist('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] }).fontFamily;
export const mono = loadGeistMono('normal', { weights: ['500', '600'], subsets: ['latin'] }).fontFamily;
export const hand = loadCaveat('normal', { weights: ['600', '700'], subsets: ['latin'] }).fontFamily;

export const C = {
  bg: '#1b1a1f',
  surface: '#24232a',
  surface2: '#2d2c33',
  surface3: '#37363e',
  border: '#3a3941',
  text: '#eceaf1',
  muted: '#a19ea9',
  accent: '#e8927a',
  accentSoft: '#4a2f28',
  accentText: '#f7c4b3',
  danger: '#d9534f',
  canvas: '#1f1e24',
  grid: 'rgb(220 215 230 / 0.13)',
  laser: '#ff5d73',
};

/** Ink on the dark canvas. */
export const INK = {
  ink: '#f1eff5',
  rose: '#f4a3b5',
  peach: '#f8bf94',
  lemon: '#f5de84',
  mint: '#97e0bf',
  sky: '#a3caf5',
  lilac: '#cbb6f5',
};

/** Pastel surfaces (chips, avatars). */
export const PASTEL = {
  rose: '#5a3441',
  peach: '#5b3e2e',
  lemon: '#564a26',
  mint: '#2c4d40',
  sky: '#2d4259',
  lilac: '#413658',
};

export type PeerColor = 'rose' | 'sky' | 'mint' | 'peach' | 'lilac';

export const glass: CSSProperties = {
  background: 'rgb(36 35 42 / 0.88)',
  backdropFilter: 'blur(14px)',
  border: `1px solid ${C.border}`,
  boxShadow: '0 1px 2px rgb(0 0 0 / 0.3), 0 8px 24px rgb(0 0 0 / 0.35)',
};

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const CODE = 'V98L';
export const SITE = 'temp-canvas.vercel.app';
