'use client';

import { useMemo } from 'react';
import { renderSVG } from 'uqr';

/** QR code as inline SVG, drawn in the current text colour on a light plate (scanners need contrast). */
export function QrCode({ value, size = 180 }: { value: string; size?: number }) {
  const svg = useMemo(() => renderSVG(value, { border: 2, whiteColor: '#ffffff', blackColor: '#1b1a1f' }), [value]);
  return (
    <div
      role="img"
      aria-label={`QR code for ${value}`}
      className="overflow-hidden rounded-xl bg-white p-1 [&>svg]:h-full [&>svg]:w-full"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** The URL a second device opens to join. On localhost in dev, the PC's LAN address instead. */
export function joinUrl(code: string): string {
  const lan = process.env.NEXT_PUBLIC_DEV_LAN_ORIGIN;
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  return `${lan && local ? lan : location.origin}/s/${code}`;
}
