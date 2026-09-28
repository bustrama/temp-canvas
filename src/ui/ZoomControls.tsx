'use client';

import type { Engine } from '@/canvas/Engine';
import { FitIcon, MinusIcon, PlusIcon } from './icons';
import { IconButton } from './IconButton';

export function ZoomControls({ engine, zoom }: { engine: Engine; zoom: number }) {
  return (
    <div className="glass pointer-events-auto absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-2 hidden items-center gap-0.5 rounded-2xl p-1.5 lg:flex">
      <IconButton label="Zoom out" onClick={() => engine.zoomBy(1 / 1.25)}>
        <MinusIcon />
      </IconButton>
      <button type="button" onClick={() => engine.resetZoom()} title="Reset zoom" className="h-10 min-w-14 rounded-xl px-2 text-sm tabular-nums hover:bg-surface-2">
        {Math.round(zoom * 100)}%
      </button>
      <IconButton label="Zoom in" onClick={() => engine.zoomBy(1.25)}>
        <PlusIcon />
      </IconButton>
      <IconButton label="Show everything" onClick={() => engine.fitContent()}>
        <FitIcon />
      </IconButton>
    </div>
  );
}
