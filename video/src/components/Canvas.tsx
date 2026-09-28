import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';
import { C } from '../theme';

/** Camera: screen = world × z + (x, y). */
export interface Cam {
  x: number;
  y: number;
  z: number;
}

export const IDENTITY: Cam = { x: 0, y: 0, z: 1 };

/** The canvas background: the app's dot grid, moving with the camera. */
export const CanvasBg: React.FC<{ cam?: Cam; spacing?: number; vignette?: boolean; style?: CSSProperties }> = ({ cam = IDENTITY, spacing = 32, vignette = false, style }) => {
  const s = spacing * cam.z;
  const r = 1.7 * Math.min(1.3, Math.max(0.7, cam.z));
  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.canvas,
        backgroundImage: `radial-gradient(circle at ${r}px ${r}px, ${C.grid} ${r}px, transparent ${r + 0.6}px)`,
        backgroundSize: `${s}px ${s}px`,
        backgroundPosition: `${cam.x}px ${cam.y}px`,
        ...style,
      }}
    >
      {vignette && <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 45%, transparent 50%, rgb(0 0 0 / 0.38) 100%)' }} />}
    </AbsoluteFill>
  );
};

/** Children placed in world coordinates. */
export const World: React.FC<{ cam?: Cam; children: ReactNode; style?: CSSProperties }> = ({ cam = IDENTITY, children, style }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transformOrigin: '0 0', transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`, ...style }}>{children}</div>
);

export const toScreen = (cam: Cam, x: number, y: number): [number, number] => [x * cam.z + cam.x, y * cam.z + cam.y];

/** Camera that centres world point (x, y) at zoom z on a screen of size w × h. */
export const centerOn = (x: number, y: number, z: number, w: number, h: number): Cam => ({ x: w / 2 - x * z, y: h / 2 - y * z, z });

export const lerpCam = (a: Cam, b: Cam, t: number): Cam => {
  // Interpolate zoom geometrically and keep the screen centre's world point moving smoothly.
  const z = a.z * Math.pow(b.z / a.z, t);
  const ca = [(960 - a.x) / a.z, (540 - a.y) / a.z];
  const cb = [(960 - b.x) / b.z, (540 - b.y) / b.z];
  const cx = ca[0] + (cb[0] - ca[0]) * t;
  const cy = ca[1] + (cb[1] - ca[1]) * t;
  return { x: 960 - cx * z, y: 540 - cy * z, z };
};
