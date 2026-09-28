'use client';

import type { EditorState, Engine, Peer } from '@/canvas/Engine';
import { peerColor, peerName } from '@/canvas/peers';
import type { DeviceKind } from '@/shared/protocol';
import { DesktopIcon, FollowIcon, TabletIcon } from './icons';

/**
 * Everyone in the session as colour dots (the same colour as their cursor on every screen).
 * Tapping someone follows their view; tapping them again stops. `compact` (phones): smaller dots
 * and none for ourselves, so five people fit on one row.
 */
export function People({ engine, state, slot, device, compact = false }: { engine: Engine; state: EditorState; slot: number | null; device: DeviceKind; compact?: boolean }) {
  const showSelf = slot !== null && !compact;
  return (
    <div className={`flex items-center ${compact ? 'gap-0.5 px-0.5' : 'gap-1 px-1'}`} role="group" aria-label="People in this session">
      {showSelf && <Avatar slot={slot} device={device} label={`You (${peerName({ slot, device })})`} self />}
      {showSelf && state.peers.length > 0 && <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />}
      {state.peers.map((p) => (
        <PeerButton key={p.id} peer={p} small={compact} following={state.following === p.id} onClick={() => engine.setFollowing(state.following === p.id ? null : p.id)} />
      ))}
    </div>
  );
}

function PeerButton({ peer, small, following, onClick }: { peer: Peer; small: boolean; following: boolean; onClick(): void }) {
  const name = peerName(peer);
  const label = !peer.online ? `${name} (disconnected)` : following ? `Following ${name}. Tap to stop (F)` : `Follow ${name}'s view (F)`;
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={following} className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2">
      <Avatar slot={peer.slot} device={peer.device} label={label} small={small} offline={!peer.online} following={following} />
    </button>
  );
}

function Avatar({ slot, device, label, self = false, small = false, offline = false, following = false }: { slot: number; device: DeviceKind; label: string; self?: boolean; small?: boolean; offline?: boolean; following?: boolean }) {
  const c = peerColor(slot);
  const Icon = device === 'pen' ? TabletIcon : DesktopIcon;
  return (
    <span
      title={self ? label : undefined}
      aria-label={self ? label : undefined}
      role={self ? 'img' : undefined}
      className={`relative flex ${small ? 'h-7 w-7' : 'h-8 w-8'} items-center justify-center rounded-full transition-[opacity,box-shadow] ${offline ? 'opacity-35 grayscale' : ''} ${self ? 'opacity-80' : ''}`}
      style={{
        background: `var(--pastel-${c})`,
        color: `var(--ink-${c})`,
        boxShadow: following ? `0 0 0 2px var(--surface), 0 0 0 4px var(--ink-${c})` : undefined,
      }}
    >
      <Icon size={small ? 14 : 16} />
      {following && (
        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-surface" style={{ color: `var(--ink-${c})` }}>
          <FollowIcon size={12} />
        </span>
      )}
    </span>
  );
}
