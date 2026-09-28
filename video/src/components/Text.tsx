import type { CSSProperties } from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { C, INK, sans } from '../theme';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const out = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * A headline whose words rise in one after another from `from`, and leave together at `leave`.
 * Words wrapped in *asterisks* take the accent colour.
 */
export const Headline: React.FC<{ text: string; from?: number; leave?: number; size?: number; weight?: number; color?: string; accent?: string; align?: CSSProperties['textAlign']; style?: CSSProperties }> = ({
  text,
  from = 0,
  leave,
  size = 104,
  weight = 600,
  color = C.text,
  accent = C.accent,
  align = 'center',
  style,
}) => {
  const frame = useCurrentFrame();
  const words = text.split(' ');
  const gone = leave === undefined ? 0 : interpolate(frame, [leave, leave + 10], [0, 1], { ...clamp, easing: Easing.bezier(0.7, 0, 0.84, 0) });
  return (
    <div style={{ fontFamily: sans, fontSize: size, fontWeight: weight, letterSpacing: '-0.035em', lineHeight: 1.08, color, textAlign: align, opacity: 1 - gone, translate: `0 ${-gone * 24}px`, ...style }}>
      {words.map((w, i) => {
        const t = interpolate(frame, [from + i * 3, from + i * 3 + 18], [0, 1], { ...clamp, easing: out });
        const hot = w.startsWith('*');
        return (
          <span key={i} style={{ display: 'inline-block', whiteSpace: 'pre', opacity: t, translate: `0 ${(1 - t) * 0.4}em`, filter: `blur(${(1 - t) * 10}px)`, color: hot ? accent : undefined }}>
            {w.replace(/\*/g, '')}
            {i < words.length - 1 ? ' ' : ''}
          </span>
        );
      })}
    </div>
  );
};

/** The six pastel dots from the home page, popping in. */
export const Dots: React.FC<{ from?: number; size?: number; gap?: number }> = ({ from = 0, size = 24, gap = 14 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap }}>
      {[INK.rose, INK.peach, INK.lemon, INK.mint, INK.sky, INK.lilac].map((c, i) => (
        <span
          key={c}
          style={{
            width: size,
            height: size,
            borderRadius: 99,
            background: c,
            scale: `${interpolate(frame, [from + i * 3, from + i * 3 + 16], [0, 1], { ...clamp, easing: Easing.spring({ damping: 12, mass: 0.6 }) })}`,
          }}
        />
      ))}
    </div>
  );
};

/** "temp canvas", letter by letter. */
export const Wordmark: React.FC<{ from?: number; size?: number }> = ({ from = 0, size = 190 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ fontFamily: sans, fontWeight: 600, fontSize: size, letterSpacing: '-0.045em', lineHeight: 1, color: C.text, whiteSpace: 'pre' }}>
      {'temp canvas'.split('').map((ch, i) => {
        const t = interpolate(frame, [from + i * 1.6, from + i * 1.6 + 16], [0, 1], { ...clamp, easing: out });
        return (
          <span key={i} style={{ display: 'inline-block', opacity: t, translate: `0 ${(1 - t) * 0.3}em`, filter: `blur(${(1 - t) * 14}px)` }}>
            {ch}
          </span>
        );
      })}
    </div>
  );
};

/** A step caption: a small label over a headline, both centred at the top of the frame. */
export const Caption: React.FC<{ label: string; text: string; from: number; leave?: number; top?: number; size?: number }> = ({ label, text, from, leave, top = 64, size = 76 }) => {
  const frame = useCurrentFrame();
  const gone = leave === undefined ? 0 : interpolate(frame, [leave, leave + 10], [0, 1], { ...clamp, easing: Easing.bezier(0.7, 0, 0.84, 0) });
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <div style={{ opacity: 1 - gone }}>
        <Eyebrow from={from}>{label}</Eyebrow>
      </div>
      <Headline text={text} from={from + 3} leave={leave} size={size} />
    </div>
  );
};

/** Small caps label above a headline. */
export const Eyebrow: React.FC<{ children: string; from?: number; color?: string; style?: CSSProperties }> = ({ children, from = 0, color = C.accent, style }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [from, from + 14], [0, 1], { ...clamp, easing: out });
  return <div style={{ fontFamily: sans, fontSize: 28, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color, opacity: t, translate: `${(1 - t) * -16}px 0`, ...style }}>{children}</div>;
};
