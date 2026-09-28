import { C, sans } from '../theme';

/** A dashboard card: the kind of thing you'd snapshot from your screen and mark up. */

const BARS = [0.34, 0.45, 0.4, 0.56, 0.5, 0.63, 0.94];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** A bar's box in card coordinates. */
export function chartBar(i: number, w: number, h: number): { x: number; y: number; w: number; h: number; cx: number; cy: number } {
  const pad = w * 0.045;
  const top = h * 0.3;
  const bottom = h - h * 0.12;
  const slot = (w - pad * 2) / BARS.length;
  const bw = slot * 0.6;
  const bh = (bottom - top) * BARS[i];
  const x = pad + slot * i + (slot - bw) / 2;
  const y = bottom - bh;
  return { x, y, w: bw, h: bh, cx: x + bw / 2, cy: y + bh / 2 };
}

export const ChartCard: React.FC<{ w: number; h: number; grow?: number; highlight?: string }> = ({ w, h, grow = 1, highlight = C.accent }) => {
  const k = w / 560;
  return (
    <div style={{ position: 'absolute', width: w, height: h, borderRadius: 18 * k, background: '#f7f4ef', boxShadow: '0 12px 40px rgb(0 0 0 / 0.35)', overflow: 'hidden', fontFamily: sans }}>
      <div style={{ position: 'absolute', left: w * 0.045, top: h * 0.07, fontSize: 17 * k, fontWeight: 500, color: '#77716c' }}>Weekly active users</div>
      <div style={{ position: 'absolute', left: w * 0.045, top: h * 0.13, fontSize: 34 * k, fontWeight: 650, color: '#2b2a33', letterSpacing: '-0.02em' }}>12,480</div>
      {BARS.map((_, i) => {
        const b = chartBar(i, w, h);
        const bh = b.h * grow;
        return <div key={i} style={{ position: 'absolute', left: b.x, top: b.y + b.h - bh, width: b.w, height: bh, borderRadius: 7 * k, background: i === BARS.length - 1 ? highlight : '#ddd6cb' }} />;
      })}
      {DAYS.map((d, i) => {
        const b = chartBar(i, w, h);
        return (
          <div key={d} style={{ position: 'absolute', left: b.cx - 30 * k, width: 60 * k, top: h - h * 0.095, textAlign: 'center', fontSize: 13 * k, fontWeight: 500, color: '#9a938c' }}>
            {d}
          </div>
        );
      })}
    </div>
  );
};
