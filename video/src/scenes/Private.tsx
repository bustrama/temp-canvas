import { Audio } from '@remotion/media';
import { mouseClick, whoosh } from '@remotion/sfx';
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { ConfirmEnd, Menu, TopBar, Toolbar } from '../components/AppUI';
import { CanvasBg, World, type Cam } from '../components/Canvas';
import { ChartCard } from '../components/Chart';
import { InkLayer } from '../components/Ink';
import { Mouse } from '../components/Pointers';
import { Headline } from '../components/Text';
import { CHART, LIVE_STROKES } from '../lib/board';
import { C } from '../theme';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const smooth = Easing.bezier(0.65, 0, 0.35, 1);
const out = Easing.bezier(0.16, 1, 0.3, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const UI = 1.5;
const CAM: Cam = { x: 960 - 610 * 1.35, y: 540 - 390 * 1.35, z: 1.35 };

// UI coordinates (CSS pixels, before the 1.5× scale).
const MENU_BUTTON = { x: 1246, y: 36 };
const END_ITEM = { x: 1110, y: 244 };
const END_BUTTON = { x: 752, y: 412 };
const OPEN = 30;
const PICK = 56;
const END = 82;

/** No accounts, no database: ending the session erases the canvas for everyone. */
export const Private: React.FC = () => {
  const frame = useCurrentFrame();

  const a = interpolate(frame, [10, 28], [0, 1], { ...clamp, easing: smooth });
  const b = interpolate(frame, [36, 52], [0, 1], { ...clamp, easing: smooth });
  const c = interpolate(frame, [62, 78], [0, 1], { ...clamp, easing: smooth });
  const mx = lerp(lerp(lerp(900, MENU_BUTTON.x, a), END_ITEM.x, b), END_BUTTON.x, c);
  const my = lerp(lerp(lerp(560, MENU_BUTTON.y, a), END_ITEM.y, b), END_BUTTON.y, c);
  const press = Math.max(...[OPEN, PICK, END].map((t) => interpolate(frame, [t - 1, t + 2, t + 7], [0, 1, 0], clamp)));

  const menu = interpolate(frame, [OPEN + 1, OPEN + 8, PICK + 1, PICK + 5], [0, 1, 1, 0], { ...clamp, easing: out });
  const dialog = interpolate(frame, [PICK + 2, PICK + 12, END + 1, END + 8], [0, 1, 1, 0], { ...clamp, easing: out });

  // Everything dissolves, piece by piece.
  const gone = (delay: number) => interpolate(frame, [END + 2 + delay, END + 22 + delay], [0, 1], { ...clamp, easing: Easing.bezier(0.5, 0, 0.75, 0) });
  const uiGone = gone(6);

  return (
    <AbsoluteFill>
      <CanvasBg cam={CAM} spacing={34} vignette />
      <World cam={CAM}>
        <div style={{ position: 'absolute', left: CHART.x, top: CHART.y, opacity: 1 - gone(0), translate: `0 ${-gone(0) * 40}px`, filter: `blur(${gone(0) * 14}px)`, scale: `${1 - gone(0) * 0.05}` }}>
          <ChartCard w={CHART.w} h={CHART.h} />
        </div>
        {LIVE_STROKES.map((s, i) => {
          const g = gone(2 + i * 1.2);
          return (
            <div key={i} style={{ position: 'absolute', left: 0, top: 0, opacity: 1 - g, translate: `0 ${-g * 50}px`, filter: `blur(${g * 10}px)` }}>
              <InkLayer strokes={[s]} frame={10000} />
            </div>
          );
        })}
      </World>

      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920 / UI, height: 1080 / UI, scale: `${UI}`, transformOrigin: '0 0' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 1 - uiGone }}>
          <TopBar self={{ color: 'rose', device: 'desktop' }} peers={[{ color: 'sky', device: 'pen' }]} />
          <Toolbar active={{ pen: 1 }} />
          {menu > 0 && <Menu hot={frame >= 50 ? 'end' : null} style={{ right: 8, top: 70, opacity: menu, scale: `${0.96 + menu * 0.04}`, transformOrigin: '100% 0' }} />}
        </div>
        {dialog > 0 && (
          <div style={{ position: 'absolute', inset: 0, background: `rgb(0 0 0 / ${0.3 * dialog})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ConfirmEnd hot={frame >= 76 ? 1 : 0} style={{ position: 'relative', opacity: dialog, scale: `${0.96 + dialog * 0.04}` }} />
          </div>
        )}
        <Mouse x={mx} y={my} scale={1.1} press={press} opacity={interpolate(frame, [4, 12, END + 6, END + 14], [0, 1, 1, 0], clamp)} />
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, top: 400 }}>
        <Headline text="No accounts. No database." from={106} size={112} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 560 }}>
        <Headline text="When the session ends, it's gone." from={120} size={56} weight={500} color={C.muted} />
      </div>

      {[OPEN, PICK, END].map((t) => (
        <Sequence key={t} from={t} durationInFrames={20} layout="none">
          <Audio src={mouseClick} volume={0.6} />
        </Sequence>
      ))}
      <Sequence from={END + 2} durationInFrames={40} layout="none">
        <Audio src={whoosh} volume={0.35} />
      </Sequence>
    </AbsoluteFill>
  );
};
