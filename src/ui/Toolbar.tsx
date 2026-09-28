'use client';

import { useRef, type Ref } from 'react';
import type { EditorState, Engine, Tool } from '@/canvas/Engine';
import { ImageIcon, RedoIcon, SnapshotIcon, TrashIcon, UndoIcon } from './icons';
import { IconButton } from './IconButton';
import { ColorButtons, Divider, GEO_ICON, GEOS, styleFlags, TOOL_INFO, WidthButtons } from './tools';

export interface ToolbarProps {
  engine: Engine;
  state: EditorState;
  canSnapshot: boolean;
  snapshotLabel: string;
  sharingScreen: boolean;
  onImage(files: FileList): void;
  onSnapshot(): void;
  onStopSharing(): void;
}

const MAIN_TOOLS: Array<Exclude<Tool, 'geo'>> = ['pen', 'highlighter', 'laser', 'eraser', 'select'];

/** Tablets and desktops: a style bar (colours, widths, shape kinds) above the tools bar. */
export function Toolbar({ engine, state, canSnapshot, snapshotLabel, sharingScreen, onImage, onSnapshot, onStopSharing }: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { colorful, sized } = styleFlags(state);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {/* Style: colours and widths */}
      {(colorful || state.selection > 0) && (
        <div className="glass no-scrollbar pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl p-1.5">
          {state.tool === 'geo' && (
            <>
              {GEOS.map((g) => (
                <IconButton key={g.geo} label={g.label} active={state.geo === g.geo} onClick={() => engine.setGeo(g.geo)}>
                  {g.icon}
                </IconButton>
              ))}
              <Divider />
            </>
          )}
          <ColorButtons engine={engine} state={state} />
          {sized && (
            <>
              <Divider />
              <WidthButtons engine={engine} state={state} />
            </>
          )}
        </div>
      )}

      {/* Tools */}
      <div className="glass no-scrollbar pointer-events-auto relative flex max-w-full items-center gap-0.5 overflow-x-auto rounded-2xl p-1.5">
        {MAIN_TOOLS.map((tool) => {
          const t = TOOL_INFO[tool];
          return (
            <IconButton key={tool} label={`${t.label} (${t.key})`} active={state.tool === tool} onClick={() => engine.setTool(tool)}>
              {t.icon}
            </IconButton>
          );
        })}
        <IconButton label="Shapes (S)" active={state.tool === 'geo'} onClick={() => engine.setTool('geo')}>
          {GEO_ICON[state.geo]}
        </IconButton>
        <IconButton label="Text (T)" active={state.tool === 'text'} onClick={() => engine.setTool('text')}>
          {TOOL_INFO.text.icon}
        </IconButton>
        <IconButton label="Hand (Space)" active={state.tool === 'hand'} onClick={() => engine.setTool('hand')}>
          {TOOL_INFO.hand.icon}
        </IconButton>
        <Divider />
        <IconButton label="Add image" onClick={() => fileRef.current?.click()}>
          <ImageIcon />
        </IconButton>
        {canSnapshot && (
          <IconButton label={snapshotLabel} active={sharingScreen} onClick={onSnapshot} onContextMenu={(e) => (e.preventDefault(), onStopSharing())}>
            <SnapshotIcon />
          </IconButton>
        )}
        <Divider />
        <IconButton label="Undo (Ctrl+Z)" disabled={!state.canUndo} onClick={() => engine.undo()}>
          <UndoIcon />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" disabled={!state.canRedo} onClick={() => engine.redo()}>
          <RedoIcon />
        </IconButton>
        {state.selection > 0 && (
          <IconButton label="Delete selection (Del)" onClick={() => engine.deleteSelection()} className="text-[var(--danger)]">
            <TrashIcon />
          </IconButton>
        )}
        <ImageInput ref={fileRef} onImage={onImage} />
      </div>
    </div>
  );
}

export function ImageInput({ ref, onImage }: { ref: Ref<HTMLInputElement>; onImage(files: FileList): void }) {
  return (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => {
        if (e.target.files?.length) onImage(e.target.files);
        e.target.value = '';
      }}
    />
  );
}
