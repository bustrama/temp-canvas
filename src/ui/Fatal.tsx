'use client';

import Link from 'next/link';
import { MAX_MEMBERS } from '@/shared/protocol';
import type { FatalReason } from '@/sync/RelayClient';

const COPY: Record<FatalReason, { title: string; body: string }> = {
  ended: { title: 'Session ended', body: 'The canvas was erased for everyone. Nothing was kept.' },
  not_found: { title: 'No session with that code', body: 'Check the code on the device that started it. The session may also have ended.' },
  full: { title: 'This session is full', body: `${MAX_MEMBERS} people are already connected, the most a session holds.` },
  replaced: { title: 'Opened somewhere else', body: 'This session continued in another tab of this browser.' },
  taken: { title: 'Code in use', body: 'Picking a new code…' },
  forbidden: { title: 'Connection refused', body: 'The relay does not accept connections from this address.' },
  bad_request: { title: 'Connection refused', body: 'The relay did not understand the request.' },
};

export function Fatal({ code, reason, onStartNew }: { code: string; reason: FatalReason; onStartNew(): void }) {
  const c = COPY[reason];
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-mono text-sm tracking-[0.3em] text-muted">{code}</p>
      <h1 className="text-2xl font-semibold">{c.title}</h1>
      <p className="max-w-sm text-balance text-muted">{c.body}</p>
      <div className="mt-2 flex gap-2">
        {reason === 'replaced' ? (
          <button type="button" onClick={() => location.reload()} className="rounded-2xl bg-accent px-5 py-3 font-semibold text-white">
            Use it here
          </button>
        ) : (
          <button type="button" onClick={onStartNew} className="rounded-2xl bg-accent px-5 py-3 font-semibold text-white">
            Start a new session
          </button>
        )}
        <Link href="/" className="rounded-2xl bg-surface-2 px-5 py-3 font-semibold">
          Home
        </Link>
      </div>
    </main>
  );
}
