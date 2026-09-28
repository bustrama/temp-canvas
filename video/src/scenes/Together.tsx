import { Audio } from '@remotion/media';
import { mouseClick } from '@remotion/sfx';
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { TopBar } from '../components/AppUI';
import { CanvasBg, World, IDENTITY, lerpCam, type Cam } from '../components/Canvas';
import { InkLayer } from '../components/Ink';
import { Mouse, PeerCursor } from '../components/Pointers';
import { Headline } from '../components/Text';
import { lines, loop, pen, penAt, type Pt, type Stroke } from '../lib/ink';
import { INK, sans, type PeerColor } from '../theme';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const smooth = Easing.bezier(0.65, 0, 0.35, 1);
const pop = Easing.spring({ damping: 11, mass: 0.6 });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const UI = 1.5;

function star(cx: number, cy: number, R: number, r: number): Pt[] {
  return Array.from({ length: 11 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 === 0 ? R : r;
    return [cx + Math.cos(a) * k, cy + Math.sin(a) * k] as Pt;
  });
}

const SKY: Stroke[] = [{ pts: lines(star(560, 420, 118, 50), 3), from: 18, dur: 36, color: INK.sky, size: 10 }];
const MINT: Stroke[] = [
  { pts: loop(1370, 400, 92, 92, 8, -1.8), from: 24, dur: 22, color: INK.mint, size: 10 },
  {
    pts: lines(
      [
        [1322, 404],
        [1360, 446],
        [1428, 352],
      ],
      9,
    ),
    from: 50,
    dur: 12,
    color: INK.mint,
    size: 10,
  },
];
const LILAC: Stroke[] = [
  {
    pts: pen(
      [
        [1500, 700],
        [1466, 652],
        [1414, 660],
        [1404, 716],
        [1444, 768],
        [1500, 812],
        [1556, 768],
        [1596, 716],
        [1586, 660],
        [1534, 652],
        [1500, 700],
      ],
      4,
    ),
    from: 34,
    dur: 32,
    color: INK.lilac,
    size: 11,
  },
  // After we start following: sparkles and an underline.
  {
    pts: lines(
      [
        [1690, 600],
        [1690, 660],
      ],
      5,
    ),
    from: 186,
    dur: 5,
    color: INK.lemon,
    size: 9,
  },
  {
    pts: lines(
      [
        [1660, 630],
        [1720, 630],
      ],
      6,
    ),
    from: 194,
    dur: 5,
    color: INK.lemon,
    size: 9,
  },
  {
    pts: pen(
      [
        [1390, 858],
        [1450, 868],
        [1530, 862],
        [1610, 850],
      ],
      7,
    ),
    from: 206,
    dur: 12,
    color: INK.lilac,
    size: 11,
  },
];

const TEXT = { x: 420, y: 650, text: 'Looks good!', from: 30, every: 3 };

// Lilac's view of the canvas (they're zoomed in on their doodle).
const VIEW = { x: 1000, y: 470, w: 1060, h: 596 };
const FOLLOWED: Cam = (() => {
  const z = Math.min(1920 / VIEW.w, 1080 / VIEW.h);
  return { x: 960 - (VIEW.x + VIEW.w / 2) * z, y: 540 - (VIEW.y + VIEW.h / 2) * z, z };
})();

const CLICK = 150;
const LILAC_AVATAR = { x: 1182, y: 35 };

const PEOPLE: Array<{ color: PeerColor; device: 'pen' | 'desktop'; at: number; strokes: Stroke[]; rest: Pt }> = [
  { color: 'sky', device: 'pen', at: 6, strokes: SKY, rest: [640, 600] },
  { color: 'mint', device: 'pen', at: 12, strokes: MINT, rest: [1500, 560] },
  { color: 'peach', device: 'desktop', at: 18, strokes: [], rest: [TEXT.x + 30, TEXT.y + 104] },
  { color: 'lilac', device: 'pen', at: 24, strokes: LILAC, rest: [1650, 900] },
];

/** Up to five people, each with their own colour; tap someone to follow their view. */
export const Together: React.FC = () => {
  const frame = useCurrentFrame();

  const follow = interpolate(frame, [CLICK + 4, CLICK + 34], [0, 1], { ...clamp, easing: smooth });
  const cam = lerpCam(IDENTITY, FOLLOWED, follow);
  const ring = interpolate(frame, [CLICK, CLICK + 10], [0, 1], { ...clamp, easing: pop });
  const viewOutline = interpolate(frame, [96, 110, CLICK, CLICK + 10], [0, 1, 1, 0], clamp);

  const toAvatar = interpolate(frame, [124, 146], [0, 1], { ...clamp, easing: smooth });
  const press = interpolate(frame, [CLICK - 1, CLICK + 2, CLICK + 7], [0, 1, 0], clamp);
  const typed = Math.max(0, Math.min(TEXT.text.length, Math.floor((frame - TEXT.from) / TEXT.every)));

  const s = (x: number, y: number): [number, number] => [x * cam.z + cam.x, y * cam.z + cam.y];

  return (
    <AbsoluteFill>
      <CanvasBg cam={cam} spacing={34} vignette />
      <World cam={cam}>
        {PEOPLE.map((p) => (
          <InkLayer key={p.color} strokes={p.strokes} frame={frame} />
        ))}
        <div style={{ position: 'absolute', left: TEXT.x, top: TEXT.y, whiteSpace: 'nowrap', fontFamily: sans, fontWeight: 600, fontSize: 64, letterSpacing: '-0.02em', color: INK.peach }}>
          {TEXT.text.slice(0, typed)}
          <span style={{ display: 'inline-block', width: 4, height: 64, marginLeft: 4, verticalAlign: 'text-bottom', background: INK.peach, opacity: frame >= TEXT.from && Math.floor(frame / 8) % 2 === 0 ? 1 : 0 }} />
        </div>
        <div
          style={{
            position: 'absolute',
            left: VIEW.x,
            top: VIEW.y,
            width: VIEW.w,
            height: VIEW.h,
            borderRadius: 18,
            border: `3px dashed ${INK.lilac}`,
            opacity: viewOutline * 0.7,
          }}
        >
          <div style={{ position: 'absolute', left: 16, top: 12, fontFamily: sans, fontWeight: 600, fontSize: 26, color: INK.lilac }}>Lilac tablet view</div>
        </div>
      </World>

      {PEOPLE.map((p) => {
        const tip = penAt(frame, p.strokes, p.rest);
        const idle = p.strokes.length === 0 ? [Math.sin(frame / 16) * 10, Math.cos(frame / 20) * 6] : [0, 0];
        const [x, y] = s(tip.x + idle[0], tip.y + idle[1]);
        const name = `${p.color[0].toUpperCase()}${p.color.slice(1)} ${p.device === 'pen' ? 'tablet' : 'desktop'}`;
        return <PeerCursor key={p.color} x={x} y={y} color={p.color} name={name} scale={1.9} opacity={interpolate(frame, [p.at, p.at + 8], [0, 1], clamp)} />;
      })}

      <AbsoluteFill style={{ background: 'linear-gradient(transparent 70%, rgb(0 0 0 / 0.5))' }} />

      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920 / UI, height: 1080 / UI, scale: `${UI}`, transformOrigin: '0 0' }}>
        <TopBar
          self={{ color: 'rose', device: 'desktop' }}
          peers={PEOPLE.map((p) => ({
            color: p.color,
            device: p.device,
            pop: interpolate(frame, [p.at, p.at + 16], [0, 1], { ...clamp, easing: pop }),
            ring: p.color === 'lilac' ? ring : 0,
          }))}
        />
        <Mouse
          x={lerp(1010, LILAC_AVATAR.x + 4, toAvatar)}
          y={lerp(520, LILAC_AVATAR.y + 6, toAvatar)}
          scale={1.1}
          press={press}
          opacity={interpolate(frame, [118, 126, CLICK + 16, CLICK + 26], [0, 1, 1, 0], clamp)}
        />
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 96 }}>
        <Headline text="Up to *five* people, live." from={8} leave={116} size={100} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 96 }}>
        <Headline text="Tap someone to *follow* their view." from={126} size={100} />
      </div>

      <Sequence from={CLICK} durationInFrames={20} layout="none">
        <Audio src={mouseClick} volume={0.6} />
      </Sequence>
    </AbsoluteFill>
  );
};

