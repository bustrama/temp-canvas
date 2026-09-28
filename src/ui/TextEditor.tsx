'use client';

import { useEffect, useRef, useState } from 'react';
import { toScreen } from '@/canvas/camera';
import type { Engine, TextEdit } from '@/canvas/Engine';
import { textFont } from '@/canvas/render';
import { TEXT_LINE_HEIGHT } from '@/canvas/shapes';
import { useCamera } from './hooks';

let measureCtx: CanvasRenderingContext2D | null = null;

function measureLine(line: string, font: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return line.length * 10;
  measureCtx.font = font;
  return measureCtx.measureText(line).width;
}

/**
 * The text box being typed into, laid exactly over where the text will render on the canvas.
 * Works with the on-screen keyboard and with Apple Pencil Scribble.
 */
export function TextEditor({ engine, edit }: { engine: Engine; edit: TextEdit }) {
  const cam = useCamera(engine);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(edit.text);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Let the pointer event that placed the box finish before focusing (iOS needs a moment).
    const t = setTimeout(() => {
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    }, 30);
    return () => clearTimeout(t);
  }, [edit.id]);

  if (!cam) return null;
  const pos = toScreen(cam, edit.x, edit.y);
  const fontPx = edit.fontSize * cam.z;
  const family = getComputedStyle(document.body).fontFamily;
  const lines = (text || ' ').split('\n');
  const widest = Math.max(fontPx, ...lines.map((line) => measureLine(line, textFont(fontPx, family))));

  return (
    <textarea
      ref={ref}
      value={text}
      aria-label="Text"
      spellCheck={false}
      onChange={(e) => {
        setText(e.target.value);
        engine.updateText(e.target.value);
      }}
      onBlur={() => engine.commitText()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          engine.commitText();
        }
      }}
      rows={lines.length}
      className="absolute z-10 resize-none overflow-hidden rounded-md border-0 bg-transparent p-0 outline-2 outline-offset-4 outline-dashed outline-[var(--canvas-selection)]"
      style={{
        left: pos.x,
        top: pos.y,
        width: widest + fontPx,
        height: lines.length * fontPx * TEXT_LINE_HEIGHT,
        font: textFont(fontPx, family),
        lineHeight: TEXT_LINE_HEIGHT,
        color: `var(--ink-${edit.color})`,
        caretColor: `var(--ink-${edit.color})`,
      }}
    />
  );
}
