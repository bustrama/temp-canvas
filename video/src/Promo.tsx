import { Audio } from '@remotion/media';
import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { AbsoluteFill, interpolate, Sequence, staticFile } from 'remotion';
import { Hook } from './scenes/Hook';
import { LiveInk } from './scenes/LiveInk';
import { Outro } from './scenes/Outro';
import { Title } from './scenes/Title';
import { Together } from './scenes/Together';

/**
 * The music (scripts/music.mjs) runs at 16 frames a beat, 64 a bar, from "Draw it with your pen."
 * (frame 98 of the hook). Every cut lands on that grid: the title at 162, live ink at 226, five people
 * at 386 (half a bar) and the end logo at 482.
 */
const BAR = 64;
const FADE = 15;
export const DURATION = 632;

const VOLUME = 1;

/** The promo: five scenes with short crossfades (632 frames, about 21 s) over its own music. */
export const Promo: React.FC = () => (
  <AbsoluteFill>
    <Scenes />
    <Audio
      src={staticFile('music/theme.m4a')}
      volume={(f) => interpolate(f, [DURATION - 30, DURATION - 2], [VOLUME, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
    />
  </AbsoluteFill>
);

/** Plays a scene from part-way in. */
const From: React.FC<{ frame: number; children: React.ReactNode }> = ({ frame, children }) => <Sequence from={-frame}>{children}</Sequence>;

const cut = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: FADE })} />;

const Scenes: React.FC = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence name="Hook" durationInFrames={98 + BAR + FADE}>
      <Hook />
    </TransitionSeries.Sequence>
    {cut}
    <TransitionSeries.Sequence name="Title" durationInFrames={BAR + FADE}>
      <Title tagline={false} />
    </TransitionSeries.Sequence>
    {cut}
    <TransitionSeries.Sequence name="Live ink" durationInFrames={2.5 * BAR + FADE}>
      <From frame={100}>
        <LiveInk />
      </From>
    </TransitionSeries.Sequence>
    {cut}
    <TransitionSeries.Sequence name="Together" durationInFrames={1.5 * BAR + FADE}>
      <Together />
    </TransitionSeries.Sequence>
    {cut}
    <TransitionSeries.Sequence name="Outro" durationInFrames={150}>
      <Outro />
    </TransitionSeries.Sequence>
  </TransitionSeries>
);
