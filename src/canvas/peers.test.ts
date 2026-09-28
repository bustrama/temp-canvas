import { describe, expect, it } from 'vitest';
import type { Presence } from '@/shared/protocol';
import { defaultFollowTarget, followLoops, peerColor, peerName, shouldYieldFollow, type Peer } from './peers';

const pres = (following: string | null = null): Presence => ({ cursor: null, pointer: null, view: { x: 0, y: 0, w: 100, h: 100 }, tool: 'pen', color: 'ink', following });

function peers(...list: Array<[id: string, slot: number, device: Peer['device'], following?: string | null, online?: boolean]>): Map<string, Peer> {
  return new Map(list.map(([id, slot, device, following = null, online = true]) => [id, { id, slot, device, online, pres: pres(following) }]));
}

describe('peer names and colours', () => {
  it('names a peer by colour and device', () => {
    expect(peerName({ slot: 0, device: 'pen' })).toBe('Rose tablet');
    expect(peerName({ slot: 1, device: 'desktop' })).toBe('Sky desktop');
  });

  it('wraps slots onto the colour list', () => {
    expect(peerColor(5)).toBe(peerColor(0));
  });
});

describe('followLoops', () => {
  it('detects direct and chained loops back to us', () => {
    expect(followLoops(peers(['b', 1, 'pen', 'me']), 'b', 'me')).toBe(true);
    expect(followLoops(peers(['b', 1, 'pen', 'c'], ['c', 2, 'pen', 'me']), 'b', 'me')).toBe(true);
    expect(followLoops(peers(['b', 1, 'pen', 'c'], ['c', 2, 'pen']), 'b', 'me')).toBe(false);
  });

  it('terminates on loops that do not include us', () => {
    expect(followLoops(peers(['b', 1, 'pen', 'c'], ['c', 2, 'pen', 'b']), 'b', 'me')).toBe(false);
  });
});

describe('shouldYieldFollow', () => {
  it('lets go when the peer we follow starts following us', () => {
    expect(shouldYieldFollow(peers(['b', 1, 'pen', 'me']), 'me', 'b', 'b')).toBe(true);
  });

  it('only the member following the newcomer lets go of a longer loop', () => {
    // me -> b -> c, then c starts following me: b lets go, not us.
    const map = peers(['b', 1, 'pen', 'c'], ['c', 2, 'pen', 'me']);
    expect(shouldYieldFollow(map, 'me', 'b', 'c')).toBe(false);
    // Seen from b (following c): c changed, and c's chain comes back to b.
    const fromB = peers(['me', 0, 'desktop', 'b'], ['c', 2, 'pen', 'me']);
    expect(shouldYieldFollow(fromB, 'b', 'c', 'c')).toBe(true);
  });

  it('keeps following when there is no loop', () => {
    expect(shouldYieldFollow(peers(['b', 1, 'pen', 'c'], ['c', 2, 'pen']), 'me', 'b', 'b')).toBe(false);
  });
});

describe('defaultFollowTarget', () => {
  it('picks the online tablet with the lowest slot', () => {
    const map = peers(['d', 0, 'desktop'], ['t2', 3, 'pen'], ['t1', 2, 'pen'], ['off', 1, 'pen', null, false]);
    expect(defaultFollowTarget(map, 'me', 'pen')).toBe('t1');
  });

  it('skips members who already follow us', () => {
    expect(defaultFollowTarget(peers(['t1', 1, 'pen', 'me'], ['t2', 2, 'pen']), 'me', 'pen')).toBe('t2');
    expect(defaultFollowTarget(peers(['t1', 1, 'pen', 'me']), 'me', 'pen')).toBeNull();
  });

  it('falls back to any device when none is given', () => {
    expect(defaultFollowTarget(peers(['d', 2, 'desktop']), 'me')).toBe('d');
  });
});
