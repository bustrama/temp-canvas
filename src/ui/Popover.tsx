'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Closes a popover on Escape or a press outside `root` (the popover plus the button that opens it).
 * A press on the canvas only closes the popover: it does not also draw a dot.
 */
export function useDismiss(root: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || root.current?.contains(target)) return;
      if (target.closest('.canvas-host')) e.stopPropagation();
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [root, open, onClose]);
}
