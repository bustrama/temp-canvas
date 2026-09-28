import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { CanvasBg } from '../components/Canvas';
import { ChartCard, chartBar } from '../components/Chart';
import { InkLayer, MouseInk } from '../components/Ink';
import { Mouse, Stylus } from '../components/Pointers';
import { Headline } from '../components/Text';
import { arrowHead, ellipseCtrl, jitter, lines, loop, pen, penAt, progressOf, type Pt, type Stroke } from '../lib/ink';
import { INK } from '../theme';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// The chart, and the bar everyone circles.
const CARD = { x: 610, y: 390, w: 700, h: 420 };
const BAR = chartBar(6, CARD.w, CARD.h);
const CX = CARD.x + BAR.cx;
const CY = CARD.y + BAR.cy - 4;

const SHAFT: Pt[] = [
  [1620, 950],
  [1500, 935],
  [1395, 872],
  [1328, 806],
];
const HEAD = arrowHead(SHAFT[3], SHAFT[2], 42, 0.5);

// With a mouse: jagged and uniform.
const M_LOOP = jitter(ellipseCtrl(CX, CY, 78, 160, -2.3, Math.PI * 2 + 0.5), 3, 9, false);
const M_SHAFT = jitter(SHAFT, 7, 8);
const M_HEAD = jitter(HEAD, 11, 5);
const M = [
  { pts: M_LOOP, from: 14, dur: 34 },
  { pts: M_SHAFT, from: 54, dur: 14 },
  { pts: M_HEAD, from: 71, dur: 8 },
];

// With the pen: the same marks, the way they look on paper.
const PEN_STROKES: Stroke[] = [
  { pts: loop(CX, CY, 78, 160, 5, -2.3), from: 106, dur: 26, color: INK.rose, size: 12 },
  { pts: pen(SHAFT, 2), from: 137, dur: 14, color: INK.rose, size: 12 },
  { pts: lines(HEAD, 4), from: 154, dur: 8, color: INK.rose, size: 12 },
];

/** Cold open: a mouse scribble, then the same marks made with a pen. */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const mouse = penAt(frame, M, [1760, 1040]);
  const stylus = penAt(frame, PEN_STROKES, [1780, 1080]);
  const mouseGone = interpolate(frame, [84, 96], [0, 1], { ...clamp, easing: Easing.bezier(0.7, 0, 0.84, 0) });

  return (
    <AbsoluteFill style={{ scale: `${interpolate(frame, [0, 180], [1, 1.035])}` }}>
      <CanvasBg vignette spacing={34} />
      <div
        style={{
          position: 'absolute',
          left: CARD.x,
          top: CARD.y,
          opacity: interpolate(frame, [0, 12], [0, 1], clamp),
          scale: `${interpolate(frame, [0, 16], [0.94, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) })}`,
        }}
      >
        <ChartCard w={CARD.w} h={CARD.h} />
      </div>

      <div style={{ position: 'absolute', inset: 0, opacity: 1 - mouseGone, filter: `blur(${mouseGone * 8}px)` }}>
        {M.map((s, i) => (
          <MouseInk key={i} pts={s.pts} progress={progressOf(frame, s)} color={INK.rose} width={6} />
        ))}
        <Mouse x={mouse.x} y={mouse.y} scale={1.6} opacity={interpolate(frame, [2, 8], [0, 1], clamp)} />
      </div>

      <InkLayer strokes={PEN_STROKES} frame={frame} />
      <Stylus x={stylus.x} y={stylus.y} lift={stylus.lift} scale={1.05} opacity={interpolate(frame, [90, 98], [0, 1], clamp)} />

      <div style={{ position: 'absolute', left: 0, right: 0, top: 120 }}>
        <Headline text="Explaining with a mouse?" from={0} leave={84} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 120 }}>
        <Headline text="Draw it with your *pen.*" from={98} />
      </div>
    </AbsoluteFill>
  );
};
