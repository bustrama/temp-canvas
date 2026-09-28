'use client';

import type { ReactNode } from 'react';
import type { EditorState, Engine, Tool } from '@/canvas/Engine';
import { INK_COLORS, type GeoKind } from '@/shared/model';
import { ArrowIcon, EllipseIcon, EraserIcon, HandIcon, HighlighterIcon, LaserIcon, LineIcon, PenIcon, RectIcon, SelectIcon, TextIcon } from './icons';

/** Tool, shape and style definitions shared by the full toolbar and the phone toolbar. */

export const TOOL_INFO: Record<Exclude<Tool, 'geo'>, { label: string; short?: string; key: string; icon: ReactNode }> = {
  pen: { label: 'Pen', key: 'P', icon: <PenIcon /> },
  highlighter: { label: 'Highlighter', key: 'H', icon: <HighlighterIcon /> },
  laser: { label: 'Laser pointer', short: 'Laser', key: 'L', icon: <LaserIcon /> },
  eraser: { label: 'Eraser', key: 'E', icon: <EraserIcon /> },
  select: { label: 'Select', key: 'V', icon: <SelectIcon /> },
  text: { label: 'Text', key: 'T', icon: <TextIcon /> },
  hand: { label: 'Hand', key: 'Space', icon: <HandIcon /> },
};

export const GEOS: Array<{ geo: GeoKind; label: string; icon: ReactNode }> = [
  { geo: 'line', label: 'Line', icon: <LineIcon /> },
  { geo: 'arrow', label: 'Arrow', icon: <ArrowIcon /> },
  { geo: 'rect', label: 'Rectangle', icon: <RectIcon /> },
  { geo: 'ellipse', label: 'Ellipse', icon: <EllipseIcon /> },
];

export const GEO_ICON: Record<GeoKind, ReactNode> = { line: <LineIcon />, arrow: <ArrowIcon />, rect: <RectIcon />, ellipse: <EllipseIcon /> };

/** The current tool's icon (shapes show the current shape kind). */
export function toolIcon(state: EditorState): ReactNode {
  return state.tool === 'geo' ? GEO_ICON[state.geo] : TOOL_INFO[state.tool].icon;
}

/** Tools that draw with a colour and a width. */
export function styleFlags(state: EditorState): { colorful: boolean; sized: boolean } {
  return {
    colorful: state.tool !== 'eraser' && state.tool !== 'hand',
    sized: state.tool === 'pen' || state.tool === 'highlighter' || state.tool === 'geo' || state.tool === 'text',
  };
}

export function ColorButtons({ engine, state }: { engine: Engine; state: EditorState }) {
  return INK_COLORS.map((c) => (
    <button
      key={c}
      type="button"
      aria-label={`Colour ${c}`}
      title={c}
      aria-pressed={state.color === c}
      onClick={() => engine.setColor(c)}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2"
    >
      <span
        className={`h-6 w-6 rounded-full transition-transform ${state.color === c ? 'scale-110 ring-2 ring-fg ring-offset-2 ring-offset-surface' : ''}`}
        style={{ background: `var(--ink-${c})` }}
      />
    </button>
  ));
}

export function WidthButtons({ engine, state }: { engine: Engine; state: EditorState }) {
  return [0, 1, 2, 3].map((i) => (
    <button
      key={i}
      type="button"
      aria-label={`Size ${i + 1}`}
      title={`Size ${i + 1}`}
      aria-pressed={state.width === i}
      onClick={() => engine.setWidth(i)}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2 ${state.width === i ? 'bg-surface-2' : ''}`}
    >
      <span className="rounded-full bg-fg" style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
    </button>
  ));
}

export function Divider({ vertical = true }: { vertical?: boolean }) {
  return vertical ? <span className="mx-1 h-6 w-px shrink-0 bg-line" aria-hidden="true" /> : <span className="my-1 h-px w-full bg-line" aria-hidden="true" />;
}
