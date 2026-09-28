'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { EditorState, Engine } from '@/canvas/Engine';
import type { DeviceKind } from '@/shared/protocol';
import type { SessionSnapshot } from '@/sync/SessionController';
import { CopyIcon, FitIcon, MinusIcon, MoonIcon, MoreIcon, PlusIcon, PowerIcon, PresentIcon, QrIcon, SunIcon } from './icons';
import { useJoinUrl } from './hooks';
import { IconButton } from './IconButton';
import { People } from './People';
import { useDismiss } from './Popover';
import { QrCode } from './QrCode';
import { setTheme, useTheme } from './theme';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  code: string;
  engine: Engine;
  state: EditorState;
  session: SessionSnapshot;
  device: DeviceKind;
  /** Phones: smaller code chip, no own avatar, and one menu button on the right. */
  compact: boolean;
  onPresent(): void;
  onEnd(): void;
}

export function TopBar({ code, engine, state, session, device, compact, onPresent, onEnd }: Props) {
  const [qrOpen, setQrOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const inviteRef = useRef<HTMLDivElement>(null);
  const closeQr = useCallback(() => setQrOpen(false), []);
  useDismiss(inviteRef, qrOpen, closeQr);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div ref={inviteRef} className={`glass pointer-events-auto relative flex min-w-0 items-center gap-1 rounded-2xl ${compact ? 'p-1' : 'p-1.5'}`}>
        <button
          type="button"
          onClick={() => setQrOpen((o) => !o)}
          className={`flex h-10 shrink-0 items-center rounded-xl bg-surface-2 font-mono font-semibold hover:bg-surface-3 ${
            compact ? 'gap-1.5 px-2.5 text-base tracking-[0.2em]' : 'gap-2 px-3 text-lg tracking-[0.25em]'
          }`}
          aria-label={`Invite code ${code}. Show QR code`}
          aria-expanded={qrOpen}
        >
          {code}
          <QrIcon size={compact ? 16 : 18} />
        </button>
        {session.status === 'online' && <People engine={engine} state={state} slot={session.slot} device={device} compact={compact} />}
        <StatusPill session={session} alone={state.peers.length === 0} />
        {qrOpen && <InvitePopover code={code} />}
      </div>

      {compact ? (
        <div className="glass pointer-events-auto rounded-2xl p-1">
          <Menu engine={engine} zoom={state.zoom} onPresent={onPresent} onEnd={() => setConfirmEnd(true)} />
        </div>
      ) : (
        <div className="glass pointer-events-auto flex items-center gap-0.5 rounded-2xl p-1.5">
          <ThemeToggle />
          <IconButton label="Hide the interface (.)" onClick={onPresent}>
            <PresentIcon />
          </IconButton>
          <IconButton label="End the session for everyone" onClick={() => setConfirmEnd(true)}>
            <PowerIcon />
          </IconButton>
        </div>
      )}

      {confirmEnd && (
        <div className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4" onClick={() => setConfirmEnd(false)}>
          <div className="glass w-full max-w-sm rounded-3xl p-6" role="dialog" aria-modal="true" aria-labelledby="end-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="end-title" className="text-lg font-semibold">
              End the session?
            </h2>
            <p className="mt-2 text-muted">The canvas is erased for everyone. Nothing is kept.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-xl px-4 py-2 font-medium hover:bg-surface-2" onClick={() => setConfirmEnd(false)} autoFocus>
                Keep drawing
              </button>
              <button type="button" className="rounded-xl bg-[var(--danger)] px-4 py-2 font-semibold text-white" onClick={onEnd}>
                End session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Phones: zoom, theme, hide the interface and end session, behind one button. */
function Menu({ engine, zoom, onPresent, onEnd }: { engine: Engine; zoom: number; onPresent(): void; onEnd(): void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const theme = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={ref} className="relative">
      <IconButton label="Menu" active={open} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        <MoreIcon />
      </IconButton>
      {open && (
        <div className="glass absolute right-0 top-[calc(100%+0.5rem)] z-10 w-60 rounded-2xl p-1.5" role="menu">
          <div className="flex items-center gap-0.5">
            <IconButton label="Zoom out" onClick={() => engine.zoomBy(1 / 1.25)}>
              <MinusIcon />
            </IconButton>
            <button type="button" onClick={() => engine.resetZoom()} title="Reset zoom" className="h-10 flex-1 rounded-xl text-sm tabular-nums hover:bg-surface-2">
              {Math.round(zoom * 100)}%
            </button>
            <IconButton label="Zoom in" onClick={() => engine.zoomBy(1.25)}>
              <PlusIcon />
            </IconButton>
            <IconButton label="Show everything" onClick={run(() => engine.fitContent())}>
              <FitIcon />
            </IconButton>
          </div>
          <span className="my-1 block h-px bg-line" aria-hidden="true" />
          <MenuItem icon={theme === 'dark' ? <SunIcon /> : <MoonIcon />} label={`${next === 'light' ? 'Light' : 'Dark'} theme`} onClick={() => setTheme(next)} />
          <MenuItem icon={<PresentIcon />} label="Hide the interface" onClick={run(onPresent)} />
          <MenuItem icon={<PowerIcon />} label="End session…" danger onClick={run(onEnd)} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, danger = false, onClick }: { icon: ReactNode; label: string; danger?: boolean; onClick(): void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium hover:bg-surface-2 ${danger ? 'text-[var(--danger)]' : ''}`}>
      {icon}
      {label}
    </button>
  );
}

/** Connection trouble, or waiting for the first person to join. Silent when all is well. */
function StatusPill({ session, alone }: { session: SessionSnapshot; alone: boolean }) {
  let text: string;
  let warn = false;
  if (session.status === 'paused') {
    text = 'Paused, tap to resume';
    warn = true;
  } else if (session.status === 'reconnecting') {
    text = session.failures >= 3 ? "Can't reach the relay, retrying" : 'Reconnecting…';
    warn = true;
  } else if (session.status !== 'online') {
    text = session.status === 'syncing' ? 'Syncing…' : 'Connecting…';
  } else if (alone) {
    text = 'Waiting for others to join';
  } else {
    return null;
  }
  return (
    <span className="flex h-10 shrink-0 items-center gap-2 px-2 text-sm text-muted" role="status" aria-live="polite" title={text}>
      <span className={`h-2 w-2 rounded-full ${warn ? 'bg-[var(--warn)]' : 'animate-pulse bg-muted'}`} />
      <span className="sr-only sm:not-sr-only">{text}</span>
    </span>
  );
}

function InvitePopover({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const url = useJoinUrl(code);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (insecure context): the URL is visible to copy by hand
    }
  };

  return (
    <div className="glass absolute left-0 top-[calc(100%+0.5rem)] z-10 w-72 max-w-[calc(100vw-1rem)] rounded-3xl p-4">
      <div className="flex justify-center">{url && <QrCode value={url} size={200} />}</div>
      <p className="mt-3 text-center text-sm text-muted">Scan with the tablet, or open the site and enter</p>
      <p className="text-center font-mono text-3xl font-semibold tracking-[0.3em]">{code}</p>
      <button type="button" onClick={copy} className="mt-3 flex w-full items-center justify-center gap-2 truncate rounded-xl bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3">
        <CopyIcon size={16} />
        <span className="truncate">{copied ? 'Copied' : url}</span>
      </button>
    </div>
  );
}
