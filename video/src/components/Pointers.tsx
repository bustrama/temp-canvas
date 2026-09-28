import { C, INK, sans, type PeerColor } from '../theme';

const OUTLINE = 'M0,0 L52,-13 L430,-13 A13,13 0 0 1 430,13 L52,13 Z';

/** A white stylus whose tip is at (x, y). `lift` raises it off the glass (0–1). */
export const Stylus: React.FC<{ x: number; y: number; lift?: number; scale?: number; opacity?: number }> = ({ x, y, lift = 0, scale = 1, opacity = 1 }) => {
  const up = lift * 26 * scale;
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: 0, height: 0, opacity }}>
      <svg width={1} height={1} style={{ position: 'absolute', overflow: 'visible', translate: `${6 + up * 1.3}px ${9 + up * 1.1}px`, filter: `blur(${5 + lift * 5}px)`, opacity: 0.5 - lift * 0.2 }}>
        <path d={OUTLINE} fill="#000" transform={`scale(${scale}) rotate(-38)`} />
      </svg>
      <svg width={1} height={1} style={{ position: 'absolute', overflow: 'visible', translate: `${up * 0.55}px ${-up}px` }}>
        <defs>
          <linearGradient id="stylus-body" x1="0" y1="-13" x2="0" y2="13" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.45" stopColor="#eeedf2" />
            <stop offset="1" stopColor="#b9b7c1" />
          </linearGradient>
          <linearGradient id="stylus-cone" x1="0" y1="-13" x2="0" y2="13" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#f7f6f9" />
            <stop offset="1" stopColor="#c4c2cb" />
          </linearGradient>
        </defs>
        <g transform={`scale(${scale}) rotate(-38)`}>
          <path d="M9,-2.4 L52,-13 L52,13 L9,2.4 Z" fill="url(#stylus-cone)" />
          <path d="M0,0 L9,-2.4 L9,2.4 Z" fill="#55535d" />
          <path d="M52,-13 L430,-13 A13,13 0 0 1 430,13 L52,13 Z" fill="url(#stylus-body)" />
          <path d="M60,-7 L425,-7" stroke="#ffffff" strokeOpacity={0.7} strokeWidth={1.5} />
          <path d="M405,-13 L405,13" stroke="#b0aeb8" strokeWidth={1} />
        </g>
      </svg>
    </div>
  );
};

/** The system mouse pointer with its tip at (x, y). */
export const Mouse: React.FC<{ x: number; y: number; scale?: number; press?: number; opacity?: number }> = ({ x, y, scale = 1, press = 0, opacity = 1 }) => (
  <svg
    width={22 * scale}
    height={30 * scale}
    viewBox="-1.5 -1.5 22 30"
    style={{ position: 'absolute', left: x - 1.5 * scale, top: y - 1.5 * scale, overflow: 'visible', opacity, scale: `${1 - press * 0.12}`, transformOrigin: '1.5px 1.5px', filter: 'drop-shadow(0 3px 5px rgb(0 0 0 / 0.45))' }}
  >
    <path d="M0 0 L0 21.5 L5.3 16.5 L9 24.8 L12.5 23.3 L8.9 15.2 L16 15.2 Z" fill="#fff" stroke="#111" strokeWidth={1.4} strokeLinejoin="round" />
  </svg>
);

/** Another member's cursor, as the app draws it: a dot, a ring and their name. */
export const PeerCursor: React.FC<{ x: number; y: number; color: PeerColor; name?: string; scale?: number; opacity?: number }> = ({ x, y, color, name, scale = 1, opacity = 1 }) => (
  <div style={{ position: 'absolute', left: x, top: y, width: 0, height: 0, opacity }}>
    <div style={{ position: 'absolute', left: -4 * scale, top: -4 * scale, width: 8 * scale, height: 8 * scale, borderRadius: 99, background: INK[color], opacity: 0.95 }} />
    <div style={{ position: 'absolute', left: -10 * scale, top: -10 * scale, width: 20 * scale, height: 20 * scale, borderRadius: 99, border: `${2 * scale}px solid ${INK[color]}`, opacity: 0.4 }} />
    {name && <div style={{ position: 'absolute', left: 14 * scale, top: 6 * scale, whiteSpace: 'nowrap', fontFamily: sans, fontWeight: 600, fontSize: 11 * scale, color: INK[color], opacity: 0.9 }}>{name}</div>}
  </div>
);

/** A tap or click ripple. */
export const Ripple: React.FC<{ x: number; y: number; t: number; color?: string; size?: number }> = ({ x, y, t, color = C.text, size = 60 }) => {
  if (t <= 0 || t >= 1) return null;
  return <div style={{ position: 'absolute', left: x - (size / 2) * t, top: y - (size / 2) * t, width: size * t, height: size * t, borderRadius: 999, border: `3px solid ${color}`, opacity: 1 - t }} />;
};
