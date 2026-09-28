import { Audio } from '@remotion/media';
import { ding, mouseClick } from '@remotion/sfx';
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { HomeScreen, TopBar, Toolbar, WaitingCard } from '../components/AppUI';
import { CanvasBg } from '../components/Canvas';
import { Laptop, Tablet } from '../components/Devices';
import { QrIcon } from '../components/icons';
import { Mouse, PeerCursor, Ripple } from '../components/Pointers';
import { Caption } from '../components/Text';
import { LAPTOP_CENTER, LAPTOP_SIDE, TABLET_SIDE } from '../layout';
import { C, INK, sans } from '../theme';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const smooth = Easing.bezier(0.65, 0, 0.35, 1);
const out = Easing.bezier(0.16, 1, 0.3, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const START_BUTTON = { x: 590, y: 352 };
const CLICK = 41;
const JOINED = 174;

/** Start a session on the computer, then scan its QR code with the tablet. */
export const Join: React.FC = () => {
  const frame = useCurrentFrame();

  // Laptop: rises in, then slides aside for the tablet.
  const rise = interpolate(frame, [0, 20], [0, 1], { ...clamp, easing: out });
  const aside = interpolate(frame, [100, 132], [0, 1], { ...clamp, easing: smooth });
  const lapLeft = lerp(LAPTOP_CENTER.left, LAPTOP_SIDE.left, aside);
  const lapTop = lerp(LAPTOP_CENTER.top, LAPTOP_SIDE.top, aside) + (1 - rise) * 80;
  const lapScale = lerp(1, LAPTOP_SIDE.width / LAPTOP_CENTER.width, aside);

  // The mouse clicks "Start a session".
  const toButton = interpolate(frame, [14, 38], [0, 1], { ...clamp, easing: smooth });
  const away = interpolate(frame, [50, 66], [0, 1], { ...clamp, easing: smooth });
  const mx = lerp(lerp(900, START_BUTTON.x, toButton), 700, away);
  const my = lerp(lerp(600, START_BUTTON.y, toButton), 470, away);
  const press = interpolate(frame, [CLICK - 1, CLICK + 2, CLICK + 7], [0, 1, 0], clamp);
  const homeOut = interpolate(frame, [48, 60], [0, 1], clamp);
  const cardIn = interpolate(frame, [52, 70], [0, 1], { ...clamp, easing: Easing.spring({ damping: 14, mass: 0.7 }) });
  const cardOut = interpolate(frame, [JOINED, JOINED + 10], [0, 1], { ...clamp, easing: Easing.bezier(0.7, 0, 0.84, 0) });
  const skyPop = interpolate(frame, [JOINED + 2, JOINED + 18], [0, 1], { ...clamp, easing: Easing.spring({ damping: 11, mass: 0.6 }) });

  // Tablet: slides in, scans, joins.
  const tabIn = interpolate(frame, [110, 140], [0, 1], { ...clamp, easing: out });
  const brackets = interpolate(frame, [140, 152], [0, 1], { ...clamp, easing: out });
  const pill = interpolate(frame, [150, 160], [0, 1], { ...clamp, easing: Easing.spring({ damping: 13, mass: 0.6 }) });
  const tap = interpolate(frame, [164, 176], [0, 1], clamp);
  const appIn = interpolate(frame, [JOINED - 4, JOINED + 8], [0, 1], clamp);

  return (
    <AbsoluteFill>
      <CanvasBg vignette spacing={34} />

      <div style={{ position: 'absolute', left: lapLeft, top: lapTop, scale: `${lapScale}`, transformOrigin: '0 0', opacity: rise }}>
        <Laptop width={LAPTOP_CENTER.width} style={{ left: 0, top: 0 }}>
          <div style={{ position: 'absolute', inset: 0, opacity: interpolate(frame, [48, 58], [0, 1], clamp) }}>
            <CanvasBg spacing={24} />
            <TopBar self={{ color: 'rose', device: 'desktop' }} peers={skyPop > 0 ? [{ color: 'sky', device: 'pen', pop: skyPop }] : []} />
            <Toolbar active={{ pen: 1 }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <WaitingCard style={{ opacity: Math.min(cardIn, 1 - cardOut), scale: `${lerp(0.9, 1, cardIn) - cardOut * 0.04}` }} />
            </div>
            <PeerCursor
              x={560 + Math.sin(frame / 14) * 40}
              y={380 + Math.cos(frame / 18) * 26}
              color="sky"
              scale={1.2}
              opacity={interpolate(frame, [JOINED + 10, JOINED + 18], [0, 1], clamp)}
            />
          </div>
          {homeOut < 1 && (
            <div style={{ position: 'absolute', inset: 0, opacity: 1 - homeOut }}>
              <HomeScreen press={press} hover={toButton > 0.9 ? 1 : 0} />
            </div>
          )}
          <Mouse x={mx} y={my} scale={1.5} press={press} opacity={interpolate(frame, [10, 16, 60, 68], [0, 1, 1, 0], clamp)} />
        </Laptop>
      </div>

      <Tablet width={TABLET_SIDE.width} style={{ left: lerp(1960, TABLET_SIDE.left, tabIn), top: TABLET_SIDE.top, rotate: `${lerp(8, 0, tabIn)}deg`, opacity: tabIn }}>
        <CameraView brackets={brackets} pill={pill} tap={tap} />
        <div style={{ position: 'absolute', inset: 0, opacity: appIn }}>
          <CanvasBg spacing={24} />
          <TopBar self={{ color: 'sky', device: 'pen' }} peers={[{ color: 'rose', device: 'desktop' }]} />
          <Toolbar active={{ pen: 1 }} />
        </div>
      </Tablet>

      <Caption label="Step 1" text="Start a session on your computer." from={4} leave={96} />
      <Caption label="Step 2" text="Scan the code with your tablet." from={106} />

      <Sequence from={CLICK} durationInFrames={20} layout="none">
        <Audio src={mouseClick} volume={0.6} />
      </Sequence>
      <Sequence from={JOINED} durationInFrames={45} layout="none">
        <Audio src={ding} volume={0.35} />
      </Sequence>
    </AbsoluteFill>
  );
};

/** The tablet's camera, pointed at the laptop's QR code. */
const CameraView: React.FC<{ brackets: number; pill: number; tap: number }> = ({ brackets, pill, tap }) => {
  const k = 1.7;
  const arm = 56;
  const half = 190 * lerp(1.25, 1, brackets);
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 50%, #34323b 0%, #141317 75%)', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 512 - 192 * k, top: 384 - 225 * k, transformOrigin: '0 0', scale: `${k}`, rotate: '-3deg', filter: 'blur(0.6px)' }}>
        <WaitingCard />
      </div>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgb(0 0 0 / 0.55) 100%)' }} />
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sy]) => (
        <div
          key={`${sx}${sy}`}
          style={{
            position: 'absolute',
            left: 512 + sx * half - (sx > 0 ? arm : 0),
            top: 384 + sy * half - (sy > 0 ? arm : 0),
            width: arm,
            height: arm,
            opacity: brackets,
            borderColor: INK.lemon,
            borderStyle: 'solid',
            borderWidth: `${sy < 0 ? 6 : 0}px ${sx > 0 ? 6 : 0}px ${sy > 0 ? 6 : 0}px ${sx < 0 ? 6 : 0}px`,
            borderRadius: `${sx < 0 && sy < 0 ? 18 : 0}px ${sx > 0 && sy < 0 ? 18 : 0}px ${sx > 0 && sy > 0 ? 18 : 0}px ${sx < 0 && sy > 0 ? 18 : 0}px`,
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          left: 512,
          top: 640,
          translate: '-50% -50%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 24px',
          borderRadius: 999,
          background: INK.lemon,
          color: C.bg,
          fontFamily: sans,
          fontSize: 24,
          fontWeight: 600,
          opacity: pill,
          scale: `${lerp(0.85, 1, pill) - (tap > 0 && tap < 0.5 ? 0.04 : 0)}`,
        }}
      >
        <QrIcon size={24} />
        temp-canvas.vercel.app
      </div>
      <Ripple x={512} y={640} t={tap} color="#fff" size={120} />
    </div>
  );
};
