'use client';

import { MAX_MEMBERS } from '@/shared/protocol';
import { useJoinUrl } from './hooks';
import { CloseIcon } from './icons';
import { IconButton } from './IconButton';
import { QrCode } from './QrCode';

/** Shown until someone else joins: the code, big, and a QR code to scan. */
export function WaitingCard({ code, compact, onClose }: { code: string; compact: boolean; onClose(): void }) {
  const url = useJoinUrl(code);
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
      <div className={`glass pointer-events-auto relative max-h-full w-full max-w-sm overflow-y-auto rounded-3xl text-center ${compact ? 'p-5' : 'p-6'}`}>
        <div className="absolute right-2 top-2">
          <IconButton label="Hide" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </div>
        <p className="text-sm font-medium text-muted">Join from your tablet</p>
        <p className={`mt-2 font-mono font-semibold tracking-[0.3em] ${compact ? 'text-4xl' : 'text-5xl'}`}>{code}</p>
        <div className={`flex justify-center ${compact ? 'mt-3' : 'mt-5'}`}>{url && <QrCode value={url} size={compact ? 150 : 196} />}</div>
        <p className="mt-4 text-balance text-sm text-muted">
          Scan the code with the tablet&apos;s camera, or open this site there and type the code. Up to {MAX_MEMBERS} people can join.
        </p>
        <p className="mt-1 truncate text-xs text-muted/70">{url}</p>
      </div>
    </div>
  );
}
