import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { CanvasBg } from '../components/Canvas';
import { InkLayer } from '../components/Ink';
import { Dots, Headline, Wordmark } from '../components/Text';
import { pen, type Stroke } from '../lib/ink';
import { C } from '../theme';

const UNDERLINE: Stroke[] = [
  {
    pts: pen(
      [
        [548, 612],
        [760, 626],
        [1000, 624],
        [1250, 612],
        [1380, 604],
      ],
      9,
    ),
    from: 34,
    dur: 20,
    color: C.accent,
    size: 16,
  },
];

/** `tagline` is off in the short promo, where the title is on screen for only two seconds. */
export const Title: React.FC<{ tagline?: boolean }> = ({ tagline = true }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ scale: `${interpolate(frame, [0, 120], [1, 1.03])}` }}>
      <CanvasBg vignette spacing={34} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 330 }}>
        <Dots from={2} size={26} gap={16} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 400, display: 'flex', justifyContent: 'center' }}>
        <Wordmark from={8} size={190} />
      </div>
      <InkLayer strokes={UNDERLINE} frame={frame} />
      {tagline && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 680 }}>
          <Headline text="Draw on your tablet. Share it live from your computer." from={44} size={50} weight={500} color={C.muted} />
        </div>
      )}
    </AbsoluteFill>
  );
};
