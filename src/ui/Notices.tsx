'use client';

import { useEffect } from 'react';
import type { SessionController, SessionSnapshot } from '@/sync/SessionController';
import { CloseIcon, SnapshotIcon } from './icons';

/** Transient messages, snapshot requests, and the "sharing your screen" chip. */
export function Notices({ ctl, session, hidden }: { ctl: SessionController; session: SessionSnapshot; hidden: boolean }) {
  const notice = session.notice;
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => ctl.dismissNotice(), 4000);
    return () => clearTimeout(t);
  }, [ctl, notice]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 flex flex-col items-center gap-2 px-2">
      {session.snapshotRequest && (
        <div className="glass pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl px-4 py-3" role="alertdialog" aria-label="Snapshot requested">
          <SnapshotIcon />
          <span className="font-medium">{session.snapshotRequest.name} asked for a snapshot of your screen</span>
          <button
            type="button"
            disabled={session.busy}
            onClick={() => void ctl.shareScreenAndSnapshot(session.snapshotRequest?.from)}
            className="rounded-xl bg-accent px-3 py-1.5 font-semibold text-white disabled:opacity-50"
          >
            Share screen
          </button>
          <button type="button" onClick={() => ctl.dismissSnapshotRequest()} className="rounded-xl px-3 py-1.5 hover:bg-surface-2">
            Not now
          </button>
        </div>
      )}
      {session.sharingScreen && !hidden && (
        <div className="glass pointer-events-auto flex items-center gap-2 rounded-full py-1 pl-3 pr-1 text-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--danger)]" />
          Screen shared for snapshots
          <button type="button" onClick={() => ctl.stopScreenShare()} className="rounded-full px-2 py-1 font-medium hover:bg-surface-2">
            Stop
          </button>
        </div>
      )}
      {notice && (
        <div key={notice.id} className="glass pointer-events-auto flex items-center gap-2 rounded-2xl py-2 pl-4 pr-1 text-sm" role="status">
          {notice.text}
          <button type="button" aria-label="Dismiss" onClick={() => ctl.dismissNotice()} className="rounded-full p-1.5 hover:bg-surface-2">
            <CloseIcon size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
