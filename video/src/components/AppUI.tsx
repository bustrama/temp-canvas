import type { CSSProperties, ReactNode } from 'react';
import { interpolateColors } from 'remotion';
import { renderSVG } from 'uqr';
import { C, CODE, INK, PASTEL, SITE, glass, mono, sans, type PeerColor } from '../theme';
import {
  DesktopIcon,
  EraserIcon,
  FollowIcon,
  HandIcon,
  HighlighterIcon,
  ImageIcon,
  LaserIcon,
  MoreIcon,
  MoonIcon,
  PenIcon,
  PowerIcon,
  PresentIcon,
  QrIcon,
  RectIcon,
  RedoIcon,
  SelectIcon,
  SnapshotIcon,
  TabletIcon,
  TextIcon,
  UndoIcon,
  MinusIcon,
  PlusIcon,
  FitIcon,
} from './icons';

/** Mock-ups of the app's own UI (src/ui), at CSS pixel size. */

export type Device = 'pen' | 'desktop';

export interface Person {
  color: PeerColor;
  device: Device;
  /** 0–1: appearing */
  pop?: number;
  /** 0–1: the follow ring */
  ring?: number;
}

export const Avatar: React.FC<Person & { size?: number; self?: boolean }> = ({ color, device, size = 32, self = false, pop = 1, ring = 0 }) => {
  const Icon = device === 'pen' ? TabletIcon : DesktopIcon;
  return (
    <span
      style={{
        position: 'relative',
        display: 'flex',
        flexShrink: 0,
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        background: PASTEL[color],
        color: INK[color],
        opacity: self ? 0.8 : 1,
        scale: `${pop}`,
        boxShadow: ring > 0 ? `0 0 0 ${2 * ring}px ${C.surface}, 0 0 0 ${4 * ring}px ${INK[color]}` : undefined,
      }}
    >
      <Icon size={size / 2} />
      {ring > 0 && (
        <span style={{ position: 'absolute', right: -4, bottom: -4, width: 16, height: 16, borderRadius: 99, background: C.surface, color: INK[color], display: 'flex', alignItems: 'center', justifyContent: 'center', scale: `${ring}` }}>
          <FollowIcon size={12} />
        </span>
      )}
    </span>
  );
};

export const TopBar: React.FC<{ self: Person; peers: Person[]; style?: CSSProperties }> = ({ self, peers, style }) => (
  <div style={{ position: 'absolute', left: 8, right: 8, top: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontFamily: sans, color: C.text, ...style }}>
    <div style={{ ...glass, display: 'flex', alignItems: 'center', gap: 4, padding: 6, borderRadius: 16 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px', borderRadius: 12, background: C.surface2, fontFamily: mono, fontWeight: 600, fontSize: 18, letterSpacing: '0.18em' }}>
        {CODE}
        <span style={{ color: C.muted, display: 'flex' }}>
          <QrIcon size={18} />
        </span>
      </span>
    </div>
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ ...glass, display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', height: 54, borderRadius: 16 }}>
        <Avatar {...self} self />
        {peers.length > 0 && <span style={{ width: 1, height: 20, margin: '0 2px', background: C.border, opacity: Math.min(1, (peers[0].pop ?? 1) * 2) }} />}
        {peers.map((p, i) => (
          <span key={i} style={{ display: 'flex', width: 36 * Math.min(1, (p.pop ?? 1) * 1.5), justifyContent: 'center', overflow: 'visible' }}>
            <Avatar {...p} />
          </span>
        ))}
      </div>
      <div style={{ ...glass, display: 'flex', padding: 6, borderRadius: 16 }}>
        <span style={{ display: 'flex', width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }}>
          <MoreIcon />
        </span>
      </div>
    </div>
  </div>
);

export type ToolKey = 'pen' | 'highlighter' | 'laser' | 'eraser' | 'select' | 'shapes' | 'text' | 'hand' | 'image' | 'snapshot' | 'undo' | 'redo';

const TOOLS: Array<ToolKey | '|'> = ['pen', 'highlighter', 'laser', 'eraser', 'select', 'shapes', 'text', 'hand', '|', 'image', 'snapshot', '|', 'undo', 'redo'];
const ICON: Record<ToolKey, ReactNode> = {
  pen: <PenIcon />,
  highlighter: <HighlighterIcon />,
  laser: <LaserIcon />,
  eraser: <EraserIcon />,
  select: <SelectIcon />,
  shapes: <RectIcon />,
  text: <TextIcon />,
  hand: <HandIcon />,
  image: <ImageIcon />,
  snapshot: <SnapshotIcon />,
  undo: <UndoIcon />,
  redo: <RedoIcon />,
};
const SWATCHES = ['ink', 'rose', 'peach', 'lemon', 'mint', 'sky', 'lilac'] as const;

/** The tools bar (and the style bar above it). `active` maps tools to how active they are (0–1). */
export const Toolbar: React.FC<{ active: Partial<Record<ToolKey, number>>; color?: (typeof SWATCHES)[number]; style?: boolean; pressed?: ToolKey; press?: number; css?: CSSProperties }> = ({
  active,
  color = 'rose',
  style = true,
  pressed,
  press = 0,
  css,
}) => (
  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, fontFamily: sans, color: C.text, ...css }}>
    {style && (
      <div style={{ ...glass, display: 'flex', alignItems: 'center', gap: 4, padding: 6, borderRadius: 16 }}>
        {SWATCHES.map((c) => (
          <span key={c} style={{ display: 'flex', width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 24, height: 24, borderRadius: 99, background: INK[c], boxShadow: c === color ? `0 0 0 2px ${C.surface}, 0 0 0 4px ${C.text}` : undefined, scale: c === color ? '1.1' : '1' }} />
          </span>
        ))}
        <span style={{ width: 1, height: 24, margin: '0 4px', background: C.border }} />
        {[0, 1, 2, 3].map((i) => (
          <span key={i} style={{ display: 'flex', width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, background: i === 1 ? C.surface2 : undefined }}>
            <span style={{ width: 4 + i * 4, height: 4 + i * 4, borderRadius: 99, background: C.text }} />
          </span>
        ))}
      </div>
    )}
    <div style={{ ...glass, display: 'flex', alignItems: 'center', gap: 2, padding: 6, borderRadius: 16 }}>
      {TOOLS.map((t, i) =>
        t === '|' ? (
          <span key={i} style={{ width: 1, height: 24, margin: '0 4px', background: C.border }} />
        ) : (
          <span
            key={t}
            style={{
              display: 'flex',
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 12,
              background: `rgb(74 47 40 / ${active[t] ?? 0})`,
              color: interpolateColors(active[t] ?? 0, [0, 1], [C.text, C.accentText]),
              opacity: t === 'redo' ? 0.4 : 1,
              scale: t === pressed ? `${1 - press * 0.12}` : '1',
            }}
          >
            {ICON[t]}
          </span>
        ),
      )}
    </div>
  </div>
);

export const Qr: React.FC<{ value: string; size: number }> = ({ value, size }) => (
  <div
    style={{ width: size, height: size, borderRadius: 12, background: '#fff', padding: 4, overflow: 'hidden' }}
    dangerouslySetInnerHTML={{ __html: renderSVG(value, { border: 2, whiteColor: '#ffffff', blackColor: '#1b1a1f' }).replace('<svg ', `<svg width="${size - 8}" height="${size - 8}" `) }}
  />
);

export const JOIN_URL = `https://${SITE}/s/${CODE}`;

export const WaitingCard: React.FC<{ style?: CSSProperties }> = ({ style }) => (
  <div style={{ ...glass, position: 'relative', width: 384, borderRadius: 24, padding: 24, textAlign: 'center', fontFamily: sans, color: C.text, ...style }}>
    <div style={{ fontSize: 14, fontWeight: 500, color: C.muted }}>Join from your tablet</div>
    <div style={{ marginTop: 8, fontFamily: mono, fontWeight: 600, fontSize: 48, letterSpacing: '0.3em', paddingLeft: '0.3em' }}>{CODE}</div>
    <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
      <Qr value={JOIN_URL} size={196} />
    </div>
    <div style={{ marginTop: 16, fontSize: 14, lineHeight: 1.45, color: C.muted }}>Scan the code with the tablet&apos;s camera, or open this site there and type the code. Up to 5 people can join.</div>
    <div style={{ marginTop: 4, fontSize: 12, color: 'rgb(161 158 169 / 0.7)' }}>{JOIN_URL}</div>
  </div>
);

export const HomeScreen: React.FC<{ press?: number; hover?: number }> = ({ press = 0, hover = 0 }) => (
  <div style={{ position: 'absolute', inset: 0, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: sans, color: C.text }}>
    <div style={{ position: 'absolute', right: 16, top: 16, display: 'flex', width: 40, height: 40, alignItems: 'center', justifyContent: 'center', color: C.muted }}>
      <MoonIcon />
    </div>
    <div style={{ width: 448 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
          {(['rose', 'peach', 'lemon', 'mint', 'sky', 'lilac'] as const).map((c) => (
            <span key={c} style={{ width: 12, height: 12, borderRadius: 99, background: PASTEL[c] }} />
          ))}
        </div>
        <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.025em' }}>temp canvas</div>
        <div style={{ marginTop: 12, fontSize: 16, lineHeight: 1.5, color: C.muted }}>Draw on your tablet with the pen. It shows up live on your computer, ready to share on screen.</div>
      </div>
      <div style={{ ...glass, borderRadius: 24, padding: 24 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderRadius: 16,
            background: C.accent,
            padding: '16px 20px',
            fontSize: 18,
            fontWeight: 600,
            color: '#fff',
            scale: `${1 - press * 0.03}`,
            filter: `brightness(${1 + hover * 0.06})`,
          }}
        >
          <DesktopIcon size={22} />
          Start a session
        </div>
        <div style={{ margin: '24px 0', display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: C.muted }}>
          <span style={{ height: 1, flex: 1, background: C.border }} />
          or join with a code
          <span style={{ height: 1, flex: 1, background: C.border }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, borderRadius: 16, border: `1px solid ${C.border}`, background: C.surface, padding: '12px 16px', textAlign: 'center', fontFamily: mono, fontSize: 24, letterSpacing: '0.4em', color: 'rgb(161 158 169 / 0.4)' }}>K7PX</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 16, background: C.surface2, padding: '0 20px', fontWeight: 600, opacity: 0.4 }}>
            <TabletIcon size={20} />
            Join
          </div>
        </div>
      </div>
      <div style={{ marginTop: 24, textAlign: 'center', fontSize: 14, color: C.muted }}>Private, up to 5 people, nothing kept after the session ends.</div>
    </div>
  </div>
);

/** The ⋯ menu, open. `hot` is the hovered item. */
export const Menu: React.FC<{ hot?: 'end' | null; style?: CSSProperties }> = ({ hot = null, style }) => {
  const item = (icon: ReactNode, label: string, danger = false, isHot = false) => (
    <div style={{ display: 'flex', height: 44, alignItems: 'center', gap: 12, padding: '0 12px', borderRadius: 12, fontSize: 14, fontWeight: 500, color: danger ? C.danger : C.text, background: isHot ? C.surface2 : undefined }}>
      {icon}
      {label}
    </div>
  );
  return (
    <div style={{ ...glass, position: 'absolute', width: 240, borderRadius: 16, padding: 6, fontFamily: sans, color: C.text, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <span style={{ display: 'flex', width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <MinusIcon />
        </span>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 14 }}>100%</span>
        <span style={{ display: 'flex', width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <PlusIcon />
        </span>
        <span style={{ display: 'flex', width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <FitIcon />
        </span>
      </div>
      <div style={{ height: 1, margin: '4px 0', background: C.border }} />
      {item(<MoonIcon />, 'Light theme')}
      {item(<PresentIcon />, 'Hide the interface')}
      <div style={{ height: 1, margin: '4px 0', background: C.border }} />
      {item(<PowerIcon />, 'End session…', true, hot === 'end')}
    </div>
  );
};

export const ConfirmEnd: React.FC<{ hot?: number; style?: CSSProperties }> = ({ hot = 0, style }) => (
  <div style={{ ...glass, position: 'absolute', width: 384, borderRadius: 24, padding: 24, fontFamily: sans, color: C.text, ...style }}>
    <div style={{ fontSize: 18, fontWeight: 600 }}>End the session?</div>
    <div style={{ marginTop: 8, fontSize: 16, color: C.muted }}>The canvas is erased for everyone. Nothing is kept.</div>
    <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <span style={{ padding: '8px 16px', borderRadius: 12, fontWeight: 500 }}>Cancel</span>
      <span style={{ padding: '8px 16px', borderRadius: 12, fontWeight: 600, color: '#fff', background: C.danger, filter: `brightness(${1 + hot * 0.12})`, scale: `${1 - hot * 0.04}` }}>End session</span>
    </div>
  </div>
);
