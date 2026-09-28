import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { CanvasBg } from '../components/Canvas';
import { InkLayer } from '../components/Ink';
import { Dots, Headline, Wordmark } from '../components/Text';
import { pen, type Stroke } from '../lib/ink';
import { C, SITE, glass, mono } from '../theme';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const UNDERLINE: Stroke[] = [
  {
    pts: pen(
      [
        [620, 548],
        [800, 560],
        [1010, 558],
        [1220, 548],
        [1310, 542],
      ],
      12,
    ),
    from: 26,
    dur: 18,
    color: C.accent,
    size: 15,
  },
];

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const url = interpolate(frame, [38, 56], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  return (
    <AbsoluteFill>
      <CanvasBg vignette spacing={34} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 290 }}>
        <Dots from={2} size={24} gap={15} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 350, display: 'flex', justifyContent: 'center' }}>
        <Wordmark from={6} size={170} />
      </div>
      <InkLayer strokes={UNDERLINE} frame={frame} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 632, display: 'flex', justifyContent: 'center', opacity: url, translate: `0 ${(1 - url) * 30}px` }}>
        <div style={{ ...glass, padding: '22px 40px', borderRadius: 28, fontFamily: mono, fontWeight: 500, fontSize: 46, color: C.text }}>{SITE}</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 790 }}>
        <Headline text="Private · Temporary · Up to 5 people" from={52} size={38} weight={500} color={C.muted} style={{ letterSpacing: '0' }} />
      </div>
      <AbsoluteFill style={{ background: '#000', opacity: interpolate(frame, [130, 150], [0, 1], clamp) }} />
    </AbsoluteFill>
  );
};
