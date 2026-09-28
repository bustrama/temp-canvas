'use client';

import { useCallback, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { Tool } from '@/canvas/Engine';
import { ImageIcon, RedoIcon, SnapshotIcon, ToolsIcon, TrashIcon, UndoIcon } from './icons';
import { IconButton } from './IconButton';
import { useDismiss } from './Popover';
import { ImageInput, type ToolbarProps } from './Toolbar';
import { ColorButtons, Divider, GEOS, styleFlags, TOOL_INFO, toolIcon, WidthButtons } from './tools';

const PRIMARY: Array<Exclude<Tool, 'geo'>> = ['pen', 'highlighter', 'eraser'];
const SECONDARY: Array<Exclude<Tool, 'geo'>> = ['laser', 'select', 'text', 'hand'];

type Panel = 'style' | 'tools' | null;

/**
 * Phones: a single row (style swatch, pen, highlighter, eraser, more tools, undo, redo). Colours and
 * sizes, and the less frequent tools, open in panels above the row.
 */
export function CompactToolbar({ engine, state, canSnapshot, snapshotLabel, sharingScreen, onImage, onSnapshot, onStopSharing }: ToolbarProps) {
  const [panel, setPanel] = useState<Panel>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setPanel(null), []);
  useDismiss(rootRef, panel !== null, close);
  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  const { sized } = styleFlags(state);
  const secondaryActive = !PRIMARY.includes(state.tool as Exclude<Tool, 'geo'>);
  const choose = (fn: () => void) => {
    setPanel(null);
    fn();
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div ref={rootRef} className="pointer-events-auto relative max-w-full">
        {panel === 'style' && (
          <div className="glass absolute bottom-[calc(100%+0.5rem)] left-1/2 w-full -translate-x-1/2 short:w-max flex flex-col items-center gap-1 rounded-2xl p-1.5 short:flex-row" role="dialog" aria-label="Colour and size">
            <div className="flex flex-wrap justify-center">
              <ColorButtons engine={engine} state={state} />
            </div>
            {sized && (
              <div className="flex justify-center short:border-l short:border-line short:pl-1">
                <WidthButtons engine={engine} state={state} />
              </div>
            )}
          </div>
        )}

        {panel === 'tools' && (
          <div className="glass absolute bottom-[calc(100%+0.5rem)] left-1/2 w-full -translate-x-1/2 short:w-max grid grid-cols-4 gap-1 rounded-2xl p-1.5 short:grid-cols-5" role="dialog" aria-label="More tools">
            {SECONDARY.map((tool) => (
              <PanelItem key={tool} label={TOOL_INFO[tool].short ?? TOOL_INFO[tool].label} title={TOOL_INFO[tool].label} active={state.tool === tool} onClick={() => choose(() => engine.setTool(tool))}>
                {TOOL_INFO[tool].icon}
              </PanelItem>
            ))}
            {GEOS.map((g) => (
              <PanelItem key={g.geo} label={g.label} active={state.tool === 'geo' && state.geo === g.geo} onClick={() => choose(() => engine.setGeo(g.geo))}>
                {g.icon}
              </PanelItem>
            ))}
            <PanelItem label="Image" onClick={() => choose(() => fileRef.current?.click())}>
              <ImageIcon />
            </PanelItem>
            {canSnapshot && (
              <PanelItem label="Snapshot" title={snapshotLabel} active={sharingScreen} onClick={() => choose(onSnapshot)} onContextMenu={(e) => (e.preventDefault(), onStopSharing())}>
                <SnapshotIcon />
              </PanelItem>
            )}
          </div>
        )}

        <div className="glass no-scrollbar flex items-center overflow-x-auto rounded-2xl p-1">
          <button
            type="button"
            aria-label="Colour and size"
            title="Colour and size"
            aria-expanded={panel === 'style'}
            onClick={() => toggle('style')}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2 ${panel === 'style' ? 'bg-surface-2' : ''}`}
          >
            <span className="h-6 w-6 rounded-full ring-2 ring-line ring-offset-2 ring-offset-surface" style={{ background: `var(--ink-${state.color})` }} />
          </button>
          <Divider />
          {PRIMARY.map((tool) => (
            <IconButton key={tool} size="narrow" label={TOOL_INFO[tool].label} active={state.tool === tool} onClick={() => engine.setTool(tool)}>
              {TOOL_INFO[tool].icon}
            </IconButton>
          ))}
          <IconButton size="narrow" label="More tools" active={secondaryActive} aria-expanded={panel === 'tools'} onClick={() => toggle('tools')}>
            <span className="relative flex">
              {secondaryActive ? toolIcon(state) : <ToolsIcon />}
              {/* Marks the button as opening a panel. */}
              <span className="absolute -right-1.5 -top-1.5 h-0 w-0 border-x-[3.5px] border-b-[4px] border-x-transparent border-b-current opacity-60" aria-hidden="true" />
            </span>
          </IconButton>
          <Divider />
          <IconButton size="narrow" label="Undo" disabled={!state.canUndo} onClick={() => engine.undo()}>
            <UndoIcon />
          </IconButton>
          <IconButton size="narrow" label="Redo" disabled={!state.canRedo} onClick={() => engine.redo()}>
            <RedoIcon />
          </IconButton>
          {state.selection > 0 && (
            <IconButton size="narrow" label="Delete selection" onClick={() => engine.deleteSelection()} className="text-[var(--danger)]">
              <TrashIcon />
            </IconButton>
          )}
        </div>
        <ImageInput ref={fileRef} onImage={onImage} />
      </div>
    </div>
  );
}

function PanelItem({ label, title, active = false, children, onClick, onContextMenu }: { label: string; title?: string; active?: boolean; children: ReactNode; onClick(): void; onContextMenu?(e: MouseEvent): void }) {
  return (
    <button
      type="button"
      title={title ?? label}
      aria-pressed={active}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-xs ${active ? 'bg-accent-soft text-accent-fg' : 'hover:bg-surface-2'}`}
    >
      {children}
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}
