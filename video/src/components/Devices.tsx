import type { CSSProperties, ReactNode } from 'react';
import { C } from '../theme';

/** Screen content is laid out at the device's CSS resolution (`screen`) and scaled into the frame. */

export const LAPTOP_SCREEN: [number, number] = [1152, 720];
export const TABLET_SCREEN: [number, number] = [1024, 768];

export const Laptop: React.FC<{ width: number; screen?: [number, number]; children: ReactNode; style?: CSSProperties }> = ({ width, screen = LAPTOP_SCREEN, children, style }) => {
  const bezel = Math.round(width * 0.018);
  const sw = width - bezel * 2;
  const sh = (sw * screen[1]) / screen[0];
  const base = width * 0.03;
  return (
    <div style={{ position: 'absolute', width, ...style }}>
      <div
        style={{
          position: 'relative',
          width,
          height: sh + bezel * 2,
          padding: bezel,
          borderRadius: width * 0.022,
          background: '#0c0b0f',
          boxShadow: '0 0 0 2px #4a4951, 0 50px 90px rgb(0 0 0 / 0.55), 0 12px 30px rgb(0 0 0 / 0.35)',
        }}
      >
        <div style={{ position: 'absolute', left: '50%', top: bezel / 2 - 3, width: 6, height: 6, marginLeft: -3, borderRadius: 9, background: '#26252c' }} />
        <Screen w={sw} h={sh} screen={screen} radius={width * 0.006}>
          {children}
        </Screen>
      </div>
      <div
        style={{
          position: 'relative',
          left: -width * 0.07,
          width: width * 1.14,
          height: base,
          borderRadius: `3px 3px ${base}px ${base}px`,
          background: 'linear-gradient(#6b6a73, #3a3940 35%, #202025)',
          boxShadow: '0 30px 50px rgb(0 0 0 / 0.5)',
        }}
      >
        <div style={{ position: 'absolute', left: '43%', width: '14%', top: 0, height: base * 0.38, borderRadius: '0 0 10px 10px', background: '#2a292f' }} />
      </div>
    </div>
  );
};

export const Tablet: React.FC<{ width: number; screen?: [number, number]; children: ReactNode; style?: CSSProperties }> = ({ width, screen = TABLET_SCREEN, children, style }) => {
  const bezel = Math.round(width * 0.032);
  const sw = width - bezel * 2;
  const sh = (sw * screen[1]) / screen[0];
  return (
    <div
      style={{
        position: 'absolute',
        width,
        height: sh + bezel * 2,
        padding: bezel,
        borderRadius: width * 0.05,
        background: '#0c0b0f',
        boxShadow: '0 0 0 3px #3f3e46, 0 0 0 4px #1a191e, 0 50px 90px rgb(0 0 0 / 0.55), 0 12px 30px rgb(0 0 0 / 0.35)',
        ...style,
      }}
    >
      <div style={{ position: 'absolute', left: '50%', top: bezel / 2 - 3, width: 6, height: 6, marginLeft: -3, borderRadius: 9, background: '#26252c' }} />
      <Screen w={sw} h={sh} screen={screen} radius={width * 0.022}>
        {children}
      </Screen>
    </div>
  );
};

const Screen: React.FC<{ w: number; h: number; screen: [number, number]; radius: number; children: ReactNode }> = ({ w, h, screen, radius, children }) => (
  <div style={{ position: 'relative', width: w, height: h, borderRadius: radius, overflow: 'hidden', background: C.canvas }}>
    <div style={{ position: 'absolute', left: 0, top: 0, width: screen[0], height: screen[1], transformOrigin: '0 0', transform: `scale(${w / screen[0]})` }}>{children}</div>
  </div>
);
