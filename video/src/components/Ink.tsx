import type { CSSProperties } from 'react';
import { progressOf, strokePath, take, type Pt, type Stroke } from '../lib/ink';

/** Pen strokes, each drawn over its own time window. */
export const InkLayer: React.FC<{ strokes: Stroke[]; frame: number; opacity?: number; style?: CSSProperties }> = ({ strokes, frame, opacity = 1, style }) => (
  <svg width={1} height={1} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity, ...style }}>
    {strokes.map((s, i) => {
      const p = progressOf(frame, s);
      if (p <= 0) return null;
      return <path key={i} d={strokePath(take(s.pts, p), s.size ?? 8, p >= 1, s.highlighter)} fill={s.color} opacity={s.highlighter ? 0.42 : 1} />;
    })}
  </svg>
);

/** A mouse drawing: uniform width, jagged. */
export const MouseInk: React.FC<{ pts: Pt[]; progress: number; color: string; width?: number }> = ({ pts, progress, color, width = 6 }) => {
  if (progress <= 0) return null;
  return (
    <svg width={1} height={1} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
      <polyline points={take(pts, progress).map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={width} strokeLinejoin="miter" strokeLinecap="round" />
    </svg>
  );
};
