import { Audio } from '@remotion/media';
import { uiSwitch } from '@remotion/sfx';
import { getStroke } from 'perfect-freehand';
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { Toolbar } from '../components/AppUI';
import { CanvasBg, World, lerpCam, type Cam } from '../components/Canvas';
import { InkLayer } from '../components/Ink';
import { Stylus } from '../components/Pointers';
import { Eyebrow, Headline } from '../components/Text';
import { cursive, lines, outlinePath, pen, penAt, progressOf, resample, spline, take, type Stroke } from '../lib/ink';
import { C, INK, sans } from '../theme';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const smooth = Easing.bezier(0.65, 0, 0.35, 1);

// Each feature has its own spot on the (infinite) canvas; the camera travels between them.
const A: Cam = { x: 0, y: 0, z: 1 };
const B: Cam = { x: -1700, y: 0, z: 1 };
const Cc: Cam = { x: -3400, y: 0, z: 1 };
const OVERVIEW: Cam = { x: 960 - 2620 * 0.4, y: 725 - 590 * 0.4, z: 0.4 };

// A: pressure.
const LOOPS: Stroke = { pts: cursive(530, 610, 7, 122, 74), from: 12, dur: 46, color: INK.sky, size: 20 };

// B: a rough rectangle, held, then snapped.
const RECT = { x: 2470, y: 500, w: 420, h: 300 };
const ROUGH: Stroke = {
  pts: lines(
    [
      [2882, 796],
      [2740, 806],
      [2560, 799],
      [2468, 804],
      [2466, 660],
      [2476, 512],
      [2600, 504],
      [2760, 507],
      [2884, 501],
      [2889, 620],
      [2893, 790],
    ],
    6,
  ),
  from: 82,
  dur: 30,
  color: INK.mint,
  size: 10,
};
const HOLD = { from: 112, dur: 14 };
const SNAP = HOLD.from + HOLD.dur;

// C: highlight a line of text.
const HIGHLIGHT: Stroke = {
  pts: pen(
    [
      [4150, 630],
      [4300, 626],
      [4450, 628],
      [4575, 624],
    ],
    8,
  ),
  from: 152,
  dur: 20,
  color: INK.lemon,
  size: 64,
  highlighter: true,
};

// D: a laser pointer tour of everything, from the overview.
const LASER_PATH = resample(
  spline([
    [620, 380],
    [960, 330],
    [1420, 420],
    [1440, 700],
    [960, 800],
    [520, 720],
    [480, 520],
    [900, 420],
    [1700, 500],
    [2440, 420],
    [2920, 460],
    [2940, 760],
    [2480, 780],
    [2500, 560],
    [3300, 560],
    [4140, 620],
    [4560, 610],
    [4600, 700],
    [4180, 720],
  ]),
  6,
);
const LASER = { from: 222, dur: 44 };

const TOOL_TIMES: Array<[number, 'pen' | 'highlighter' | 'laser']> = [
  [0, 'pen'],
  [140, 'highlighter'],
  [210, 'laser'],
];

/** Made for the pen: pressure, hold to snap, highlighter, laser. */
export const Tools: React.FC = () => {
  const frame = useCurrentFrame();

  const cam = (() => {
    if (frame < 140) return lerpCam(A, B, interpolate(frame, [64, 80], [0, 1], { ...clamp, easing: smooth }));
    if (frame < 205) return lerpCam(B, Cc, interpolate(frame, [134, 150], [0, 1], { ...clamp, easing: smooth }));
    return lerpCam(Cc, OVERVIEW, interpolate(frame, [204, 222], [0, 1], { ...clamp, easing: smooth }));
  })();

  const snap = interpolate(frame, [SNAP, SNAP + 10], [0, 1], { ...clamp, easing: Easing.spring({ damping: 12, mass: 0.6 }) });
  const hold = interpolate(frame, [HOLD.from, SNAP], [0, 1], clamp);

  // The pen: its tip follows whatever is being drawn, or the laser.
  const penStrokes = [LOOPS, ROUGH, { pts: [ROUGH.pts[ROUGH.pts.length - 1], ROUGH.pts[ROUGH.pts.length - 1]], ...HOLD }, HIGHLIGHT, { pts: LASER_PATH, ...LASER }];
  const tip = penAt(frame, penStrokes, [700, 900]);
  const laserP = progressOf(frame, LASER);
  const laserTail = progressOf(frame - 7, LASER);
  const laserPts = take(LASER_PATH, laserP).slice(Math.floor(laserTail * LASER_PATH.length));
  const laserOn = frame >= LASER.from && frame <= LASER.from + LASER.dur + 8;
  const laserFade = interpolate(frame, [LASER.from + LASER.dur, LASER.from + LASER.dur + 8], [1, 0], clamp);

  // The active tool's highlight crossfades from the previous tool.
  const current = TOOL_TIMES.filter(([at]) => frame >= at).length - 1;
  const switchIn = interpolate(frame, [TOOL_TIMES[current][0], TOOL_TIMES[current][0] + 6], [0, 1], clamp);
  const active = (t: 'pen' | 'highlighter' | 'laser') => (TOOL_TIMES[current][1] === t ? (current === 0 ? 1 : switchIn) : current > 0 && TOOL_TIMES[current - 1][1] === t ? 1 - switchIn : 0);

  return (
    <AbsoluteFill>
      <CanvasBg cam={cam} spacing={34} vignette />
      <World cam={cam}>
        <InkLayer strokes={[LOOPS]} frame={frame} />

        <div style={{ opacity: 1 - snap }}>
          <InkLayer strokes={[ROUGH]} frame={frame} />
        </div>
        <div
          style={{
            position: 'absolute',
            left: RECT.x,
            top: RECT.y,
            width: RECT.w,
            height: RECT.h,
            border: `10px solid ${INK.mint}`,
            borderRadius: 14,
            opacity: snap,
            scale: `${1.04 - snap * 0.04}`,
          }}
        />

        <div style={{ position: 'absolute', left: 3960, top: 470, width: 800, textAlign: 'center', fontFamily: sans, fontWeight: 600, fontSize: 84, lineHeight: 1.18, letterSpacing: '-0.03em', color: INK.ink }}>
          Ship the beta
          <br />
          on Friday
        </div>
        <InkLayer strokes={[HIGHLIGHT]} frame={frame} style={{ mixBlendMode: 'screen' }} />
      </World>

      {laserOn && laserPts.length > 1 && (
        <svg width={1} height={1} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: laserFade, filter: `drop-shadow(0 0 10px ${C.laser}) drop-shadow(0 0 4px ${C.laser})` }}>
          <path d={outlinePath(getStroke(laserPts.map(([x, y]) => [x * cam.z + cam.x, y * cam.z + cam.y, 0.5]), { size: 14, thinning: 0, smoothing: 0.5, streamline: 0.2, simulatePressure: false, start: { taper: true }, last: true }))} fill={C.laser} />
        </svg>
      )}

      {/* The hold-to-snap timer around the pen tip. */}
      {hold > 0 && hold < 1 && (
        <svg width={1} height={1} style={{ position: 'absolute', left: tip.x * cam.z + cam.x, top: tip.y * cam.z + cam.y, overflow: 'visible' }}>
          <circle r={30} fill="none" stroke={C.text} strokeOpacity={0.25} strokeWidth={4} />
          <circle r={30} fill="none" stroke={C.text} strokeWidth={4} strokeDasharray={`${hold * 188.5} 188.5`} transform="rotate(-90)" strokeLinecap="round" />
        </svg>
      )}

      <Stylus x={tip.x * cam.z + cam.x} y={tip.y * cam.z + cam.y} lift={tip.lift} scale={1.1} opacity={interpolate(frame, [0, 8, 262, 270], [0, 1, 1, 0.9], clamp)} />

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1080 / 1.45, transformOrigin: '50% 100%', scale: '1.45' }}>
        <Toolbar active={{ pen: active('pen'), highlighter: active('highlighter'), laser: active('laser') }} style={false} />
      </div>

      <div style={{ position: 'absolute', left: 120, top: 96 }}>
        <Eyebrow from={0}>Made for the pen</Eyebrow>
        <div style={{ position: 'relative', marginTop: 18, height: 120 }}>
          <Headline text="Real pressure." from={4} leave={62} size={100} align="left" style={{ position: 'absolute', whiteSpace: 'nowrap' }} />
          <Headline text="Hold to snap a shape." from={74} leave={132} size={100} align="left" style={{ position: 'absolute', whiteSpace: 'nowrap' }} />
          <Headline text="Highlight what matters." from={144} leave={200} size={100} align="left" style={{ position: 'absolute', whiteSpace: 'nowrap' }} />
          <Headline text="Point with a laser." from={212} size={100} align="left" style={{ position: 'absolute', whiteSpace: 'nowrap' }} />
        </div>
      </div>

      <Sequence from={SNAP} durationInFrames={20} layout="none">
        <Audio src={uiSwitch} volume={0.45} />
      </Sequence>
    </AbsoluteFill>
  );
};

