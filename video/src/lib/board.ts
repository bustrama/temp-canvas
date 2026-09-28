import { chartBar } from '../components/Chart';
import { INK } from '../theme';
import { arrowHead, lines, loop, pen, type Pt, type Stroke } from './ink';

/** The annotated chart drawn on the tablet (world = the tablet's screen, 1024 × 768). */

export const CHART = { x: 232, y: 150, w: 560, h: 360 };
const bar = chartBar(6, CHART.w, CHART.h);
const BX = CHART.x + bar.cx;
const BY = CHART.y + bar.cy - 6;

const SHAFT: Pt[] = [
  [948, 604],
  [905, 574],
  [848, 522],
  [800, 486],
];

/** "+38%" as real pen strokes, glyph by glyph, starting at frame `from`. */
function handwriting(ox: number, oy: number, k: number, from: number, color: string): Stroke[] {
  const P = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [ox + x * k, oy + y * k]);
  const ring = (cx: number, cy: number, r: number): Pt[] => Array.from({ length: 9 }, (_, i) => [cx + Math.cos(-2 + i * 0.85) * r, cy + Math.sin(-2 + i * 0.85) * r * 1.15] as Pt);
  const glyphs: Array<{ pts: Pt[]; dur: number; straight?: boolean }> = [
    { pts: P([[0, 32], [36, 30]]), dur: 4, straight: true },
    { pts: P([[18, 14], [17, 50]]), dur: 4, straight: true },
    { pts: P([[48, 16], [62, 7], [77, 13], [75, 26], [62, 32], [79, 40], [78, 54], [63, 62], [47, 55]]), dur: 9 },
    { pts: P([[114, 14], [101, 6], [89, 14], [93, 26], [104, 33], [115, 43], [111, 57], [98, 62], [88, 53], [93, 41], [104, 33], [112, 23], [114, 14]]), dur: 11 },
    { pts: P(ring(138, 18, 8)), dur: 5 },
    { pts: P([[168, 8], [134, 62]]), dur: 4, straight: true },
    { pts: P(ring(166, 52, 8)), dur: 5 },
  ];
  let t = from;
  return glyphs.map((g, i) => {
    const s: Stroke = { pts: g.straight ? lines(g.pts, 20 + i) : pen(g.pts, 20 + i), from: t, dur: g.dur, color, size: 7 };
    t += g.dur + 3;
    return s;
  });
}

export const LIVE_STROKES: Stroke[] = [
  { pts: loop(BX, BY, 54, 130, 5, -2.3), from: 110, dur: 26, color: INK.rose, size: 9 },
  { pts: pen(SHAFT, 2), from: 142, dur: 13, color: INK.rose, size: 9 },
  { pts: lines(arrowHead(SHAFT[3], SHAFT[2], 30, 0.5), 4), from: 158, dur: 7, color: INK.rose, size: 9 },
  ...handwriting(826, 206, 0.95, 172, INK.rose),
];

const lastWriting = LIVE_STROKES[LIVE_STROKES.length - 1];
const underlineFrom = lastWriting.from + lastWriting.dur + 5;

LIVE_STROKES.push({
  pts: pen(
    [
      [822, 292],
      [880, 297],
      [950, 289],
      [990, 284],
    ],
    31,
  ),
  from: underlineFrom,
  dur: 10,
  color: INK.rose,
  size: 9,
});
