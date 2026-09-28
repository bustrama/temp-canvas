'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  /** `narrow` squeezes a phone toolbar row (still 40 px tall for the thumb). */
  size?: 'normal' | 'narrow';
  children: ReactNode;
}

/** Square icon button with an accessible label and a tooltip. */
export function IconButton({ label, active = false, size = 'normal', className = '', children, ...rest }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={`inline-flex h-10 ${size === 'narrow' ? 'w-9' : 'w-10'} shrink-0 items-center justify-center rounded-xl text-fg transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-35 ${
        active ? 'bg-accent-soft text-accent-fg hover:bg-accent-soft' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
