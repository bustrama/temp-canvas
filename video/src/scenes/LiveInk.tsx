import { Audio } from '@remotion/media';
import { mouseClick, shutterModern } from '@remotion/sfx';
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { TopBar, Toolbar } from '../components/AppUI';
import { CanvasBg, World, type Cam } from '../components/Canvas';
import { ChartCard } from '../components/Chart';
import { Laptop, Tablet } from '../components/Devices';
import { InkLayer } from '../components/Ink';
import { Mouse, PeerCursor, Stylus } from '../components/Pointers';
import { Caption } from '../components/Text';
import { CHART, LIVE_STROKES } from '../lib/board';
import { penAt } from '../lib/ink';
import { FOLLOW_CAM, LAPTOP_SIDE, TABLET_SIDE, tabletScreen } from '../layout';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const smooth = Easing.bezier(0.65, 0, 0.35, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const SNAP_BUTTON = { x: 723, y: 681 };
const CLICK = 28;
/** The laptop shows each stroke this many frames after the tablet. */
const DELAY = 2;

/** The snapshot and the drawing, in world coordinates. */
const Board: React.FC<{ frame: number; cam: Cam; snapIn: number }> = ({ frame, cam, snapIn }) => (
  <World cam={cam}>
    <div style={{ position: 'absolute', left: CHART.x, top: CHART.y, opacity: snapIn, scale: `${lerp(0.92, 1, snapIn)}` }}>
      <ChartCard w={CHART.w} h={CHART.h} />
    </div>
    <InkLayer strokes={LIVE_STROKES} frame={frame} />
  </World>
);

/** Snapshot the screen from the computer, then mark it up on the tablet: it shows up live on both. */
export const LiveInk: React.FC = () => {
  const frame = useCurrentFrame();
  const ts = tabletScreen(TABLET_SIDE);

  const toSnap = interpolate(frame, [6, 24], [0, 1], { ...clamp, easing: smooth });
  const press = interpolate(frame, [CLICK - 1, CLICK + 2, CLICK + 7], [0, 1, 0], clamp);
  const flash = interpolate(frame, [CLICK + 1, CLICK + 3, CLICK + 14], [0, 0.75, 0], clamp);
  const snapLaptop = interpolate(frame, [CLICK + 4, CLICK + 18], [0, 1], { ...clamp, easing: Easing.spring({ damping: 14, mass: 0.7 }) });
  const snapTablet = interpolate(frame, [CLICK + 7, CLICK + 21], [0, 1], { ...clamp, easing: Easing.spring({ damping: 14, mass: 0.7 }) });

  const tip = penAt(frame, LIVE_STROKES, [1140, 700]);
  const peer = penAt(frame - DELAY, LIVE_STROKES, [1140, 700]);
  const push = interpolate(frame, [190, 300], [1, 1.05], { ...clamp, easing: smooth });

  return (
    <AbsoluteFill style={{ scale: `${push}`, transformOrigin: '30% 62%' }}>
      <CanvasBg vignette spacing={34} />

      <Laptop width={LAPTOP_SIDE.width} style={{ left: LAPTOP_SIDE.left, top: LAPTOP_SIDE.top }}>
        <CanvasBg spacing={24} />
        <Board frame={frame - DELAY} cam={FOLLOW_CAM} snapIn={snapLaptop} />
        <PeerCursor x={peer.x * FOLLOW_CAM.z + FOLLOW_CAM.x} y={peer.y * FOLLOW_CAM.z + FOLLOW_CAM.y} color="sky" scale={1.2} opacity={interpolate(frame, [70, 80], [0, 1], clamp)} />
        <TopBar self={{ color: 'rose', device: 'desktop' }} peers={[{ color: 'sky', device: 'pen' }]} />
        <Toolbar active={{ pen: 1 }} pressed="snapshot" press={press} />
        <Mouse x={lerp(840, SNAP_BUTTON.x, toSnap)} y={lerp(560, SNAP_BUTTON.y, toSnap)} scale={1.5} press={press} opacity={interpolate(frame, [2, 8, 44, 54], [0, 1, 1, 0], clamp)} />
        <AbsoluteFill style={{ background: '#fff', opacity: flash }} />
      </Laptop>

      <Tablet width={TABLET_SIDE.width} style={{ left: TABLET_SIDE.left, top: TABLET_SIDE.top }}>
        <CanvasBg spacing={24} />
        <Board frame={frame} cam={{ x: 0, y: 0, z: 1 }} snapIn={snapTablet} />
        <TopBar self={{ color: 'sky', device: 'pen' }} peers={[{ color: 'rose', device: 'desktop' }]} />
        <Toolbar active={{ pen: 1 }} />
      </Tablet>

      <Stylus x={ts.x + tip.x * ts.s} y={ts.y + tip.y * ts.s} lift={tip.lift} scale={0.78} opacity={interpolate(frame, [76, 86], [0, 1], clamp)} />

      <Caption label="Snapshot" text="Grab anything on your screen." from={2} leave={92} />
      <Caption label="Live ink" text="Draw on the tablet. It's live everywhere." from={100} />

      <Sequence from={CLICK} durationInFrames={20} layout="none">
        <Audio src={mouseClick} volume={0.6} />
      </Sequence>
      <Sequence from={CLICK + 1} durationInFrames={40} layout="none">
        <Audio src={shutterModern} volume={0.4} />
      </Sequence>
    </AbsoluteFill>
  );
};
