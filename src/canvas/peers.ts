import { PEER_COLORS, type DeviceKind, type PeerColor, type Presence } from '@/shared/protocol';

/**
 * The other people in the session, as this device sees them. Pure helpers for naming, colours and
 * follow mode (who to follow by default, and breaking follow loops).
 */

export interface Peer {
  readonly id: string;
  readonly device: DeviceKind;
  /** Colour slot assigned by the relay: the same person has the same colour on every device. */
  readonly slot: number;
  readonly online: boolean;
  readonly pres: Presence | null;
}

export function peerColor(slot: number): PeerColor {
  return PEER_COLORS[((slot % PEER_COLORS.length) + PEER_COLORS.length) % PEER_COLORS.length];
}

/** "Sky tablet", "Rose desktop": colour plus device, the same on every screen. */
export function peerName(p: { slot: number; device: DeviceKind }): string {
  const c = peerColor(p.slot);
  return `${c[0].toUpperCase()}${c.slice(1)} ${p.device === 'pen' ? 'tablet' : 'desktop'}`;
}

/**
 * True when following `start` ends up following `me` again (directly or through a chain of
 * followers), which would make the views chase each other.
 */
export function followLoops(peers: ReadonlyMap<string, Peer>, start: string | null, me: string): boolean {
  let id = start;
  for (let steps = 0; id !== null && steps <= peers.size; steps++) {
    if (id === me) return true;
    id = peers.get(id)?.pres?.following ?? null;
  }
  return false;
}

/**
 * A peer just changed who they follow. If that closed a loop through us, the newer follower wins:
 * the member following that peer lets go, which is us when our target is the one who changed.
 */
export function shouldYieldFollow(peers: ReadonlyMap<string, Peer>, me: string, following: string | null, changed: string): boolean {
  return following === changed && followLoops(peers, following, me);
}

/**
 * Who to follow automatically (desktop showing the drawing): the online tablet with the lowest
 * slot, then any online member, skipping anyone whose view already follows ours.
 */
export function defaultFollowTarget(peers: ReadonlyMap<string, Peer>, me: string, device?: DeviceKind): string | null {
  const candidates = [...peers.values()]
    .filter((p) => p.online && (device === undefined || p.device === device) && !followLoops(peers, p.id, me))
    .sort((a, b) => a.slot - b.slot);
  return candidates[0]?.id ?? null;
}
