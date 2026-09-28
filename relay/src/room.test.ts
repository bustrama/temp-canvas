import { beforeEach, describe, expect, it } from 'vitest';
import type { Shape } from '../../src/shared/model';
import { CLOSE, MAX_MEMBERS, type ServerMessage } from '../../src/shared/protocol';
import { ROOM, RoomCore, type RoomClock, type RoomSocket } from './room';

class FakeClock implements RoomClock {
  t = 1_000;
  private timers: Array<{ at: number; fn: () => void; id: number }> = [];
  private nextId = 1;
  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.push({ at: this.t + ms, fn, id });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.timers = this.timers.filter((t) => t.id !== handle);
  }
  advance(ms: number): void {
    this.t += ms;
    const due = this.timers.filter((t) => t.at <= this.t);
    this.timers = this.timers.filter((t) => t.at > this.t);
    for (const t of due) t.fn();
  }
}

class FakeSocket implements RoomSocket {
  sent: ServerMessage[] = [];
  closed: { code: number; reason: string } | null = null;
  send(data: string): void {
    const v = JSON.parse(data) as ServerMessage | ServerMessage[];
    this.sent.push(...(Array.isArray(v) ? v : [v]));
  }
  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }
  of<T extends ServerMessage['t']>(t: T): Array<Extract<ServerMessage, { t: T }>> {
    return this.sent.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
  }
  clear(): void {
    this.sent = [];
  }
}

const stroke = (id: string, by = 'a'): Shape => ({ id, z: 1, by, kind: 'stroke', style: 'pen', color: 'ink', size: 4, pts: [0, 0, 0.5, 10, 10, 0.5] });

describe('RoomCore', () => {
  let clock: FakeClock;
  let room: RoomCore;
  let a: FakeSocket;
  let b: FakeSocket;

  beforeEach(() => {
    clock = new FakeClock();
    room = new RoomCore(clock);
    a = new FakeSocket();
    b = new FakeSocket();
  });

  const create = () => room.connect(a, { clientId: 'a', mode: 'create', device: 'desktop' });
  const join = (sock = b, clientId = 'b') => room.connect(sock, { clientId, mode: 'join', device: 'pen' });

  it('creates a fresh room', () => {
    expect(create()).toBe(true);
    expect(a.of('welcome')[0]).toMatchObject({ you: 'a', fresh: true, peers: [] });
    expect(a.of('shapes')).toEqual([{ t: 'shapes', shapes: [], last: true }]);
  });

  it('refuses to create a room whose code is in use', () => {
    create();
    const c = new FakeSocket();
    expect(room.connect(c, { clientId: 'c', mode: 'create', device: 'desktop' })).toBe(false);
    expect(c.closed?.code).toBe(CLOSE.taken);
  });

  it('refuses to join a room that does not exist', () => {
    expect(join()).toBe(false);
    expect(b.closed?.code).toBe(CLOSE.notFound);
    expect(b.of('err')[0].code).toBe(CLOSE.notFound);
  });

  it('lets a second member join and announces them', () => {
    create();
    expect(join()).toBe(true);
    expect(a.of('welcome')[0].slot).toBe(0);
    expect(b.of('welcome')[0]).toMatchObject({ you: 'b', slot: 1, fresh: false, peers: [{ id: 'a', device: 'desktop', slot: 0 }] });
    expect(a.of('peer')[0]).toMatchObject({ on: true, peer: { id: 'b', device: 'pen', slot: 1 } });
  });

  it(`caps the room at ${MAX_MEMBERS} members`, () => {
    create();
    for (let i = 1; i < MAX_MEMBERS; i++) expect(join(new FakeSocket(), `m${i}`)).toBe(true);
    const extra = new FakeSocket();
    expect(join(extra, 'extra')).toBe(false);
    expect(extra.closed?.code).toBe(CLOSE.full);
    expect(room.memberCount).toBe(MAX_MEMBERS);
  });

  it('gives each member the lowest free colour slot and keeps it across reconnects', () => {
    create();
    join();
    const c = new FakeSocket();
    join(c, 'c');
    expect(c.of('welcome')[0].slot).toBe(2);
    room.disconnect(b);
    const d = new FakeSocket();
    join(d, 'd');
    expect(d.of('welcome')[0].slot).toBe(1);
    const c2 = new FakeSocket();
    room.connect(c2, { clientId: 'c', mode: 'resume', device: 'pen' });
    expect(c2.of('welcome')[0].slot).toBe(2);
  });

  it('gives a resuming member their old slot back when it is free (relay restart)', () => {
    expect(room.connect(a, { clientId: 'a', mode: 'resume', device: 'desktop', slot: 3 })).toBe(true);
    expect(a.of('welcome')[0].slot).toBe(3);
    expect(room.connect(b, { clientId: 'b', mode: 'resume', device: 'pen', slot: 3 })).toBe(true);
    expect(b.of('welcome')[0].slot).toBe(0); // taken: lowest free
    const c = new FakeSocket();
    room.connect(c, { clientId: 'c', mode: 'resume', device: 'pen', slot: 99 });
    expect(c.of('welcome')[0].slot).toBe(1); // out of range: ignored
  });

  it('forwards everything to all the others, tagged with the sender', () => {
    create();
    join();
    const c = new FakeSocket();
    join(c, 'c');
    a.clear();
    b.clear();
    c.clear();
    room.receive(b, JSON.stringify([{ t: 'live', e: { k: 'end', id: 's', keep: false } }, { t: 'ops', seq: 1, ops: [{ o: 'put', shape: stroke('s1', 'b') }] }]));
    for (const s of [a, c]) {
      expect(s.of('live')[0]).toMatchObject({ from: 'b', e: { k: 'end', id: 's' } });
      expect(s.of('ops')).toHaveLength(1);
    }
    expect(b.of('live')).toHaveLength(0);
  });

  it('delivers a command to one member when addressed, else to all the others', () => {
    create();
    join();
    const c = new FakeSocket();
    join(c, 'c');
    a.clear();
    c.clear();
    room.receive(b, JSON.stringify({ t: 'cmd', c: { k: 'snapshot-request' }, to: 'a' }));
    expect(a.of('cmd')).toEqual([{ t: 'cmd', from: 'b', c: { k: 'snapshot-request' } }]);
    expect(c.of('cmd')).toHaveLength(0);
    room.receive(b, JSON.stringify({ t: 'cmd', c: { k: 'snapshot-request' }, to: 'nobody' }));
    room.receive(b, JSON.stringify({ t: 'cmd', c: { k: 'snapshot-request' } }));
    expect(a.of('cmd')).toHaveLength(2);
    expect(c.of('cmd')).toHaveLength(1);
  });

  it('lets the same client reconnect and closes its old socket', () => {
    create();
    join();
    const b2 = new FakeSocket();
    expect(room.connect(b2, { clientId: 'b', mode: 'resume', device: 'pen' })).toBe(true);
    expect(b.closed?.code).toBe(CLOSE.replaced);
    expect(room.memberCount).toBe(2);
    // The stale socket's close event must not remove the new one.
    room.disconnect(b);
    expect(room.memberCount).toBe(2);
  });

  it('applies ops, acks the sender and forwards them to the others', () => {
    create();
    join();
    a.clear();
    b.clear();
    room.receive(a, JSON.stringify({ t: 'ops', seq: 7, ops: [{ o: 'put', shape: stroke('s1') }] }));
    expect(a.of('ack')).toEqual([{ t: 'ack', seq: 7 }]);
    expect(b.of('ops')[0].ops).toEqual([{ o: 'put', shape: stroke('s1') }]);
    expect(room.shapeCount).toBe(1);

    room.receive(b, JSON.stringify({ t: 'ops', seq: 1, ops: [{ o: 'del', id: 's1' }] }));
    expect(room.shapeCount).toBe(0);
  });

  it('sends existing shapes to a member who joins later', () => {
    create();
    room.receive(a, JSON.stringify({ t: 'ops', seq: 1, ops: [{ o: 'put', shape: stroke('s1') }, { o: 'put', shape: stroke('s2') }] }));
    join();
    const shapes = b.of('shapes');
    expect(shapes.at(-1)?.last).toBe(true);
    expect(shapes.flatMap((s) => s.shapes).map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('drops invalid ops without breaking the frame', () => {
    create();
    room.receive(a, JSON.stringify([{ t: 'ops', seq: 1, ops: [{ o: 'put', shape: { id: 'x', kind: 'nope' } }] }, { t: 'ping' }]));
    expect(room.shapeCount).toBe(0);
    expect(a.of('pong')).toHaveLength(1);
  });

  it('forwards live strokes and presence without storing strokes', () => {
    create();
    join();
    b.clear();
    const pres = { cursor: [1, 2], pointer: 'pen', view: { x: 0, y: 0, w: 100, h: 100 }, tool: 'pen', color: 'ink' };
    room.receive(a, JSON.stringify([{ t: 'live', e: { k: 'pts', id: 's', pts: [1, 2, 0.5] } }, { t: 'pres', p: pres }]));
    expect(b.of('live')[0].e).toEqual({ k: 'pts', id: 's', pts: [1, 2, 0.5] });
    expect(b.of('pres')[0]).toMatchObject({ from: 'a', p: pres });
    expect(room.shapeCount).toBe(0);

    // A member joining later sees the last presence (so follow mode can start right away).
    room.disconnect(b);
    const b2 = new FakeSocket();
    join(b2);
    expect(b2.of('welcome')[0].peers[0].pres).toEqual(pres);
  });

  it('keeps an empty room joinable during the grace period, then wipes it', () => {
    create();
    room.receive(a, JSON.stringify({ t: 'ops', seq: 1, ops: [{ o: 'put', shape: stroke('s1') }] }));
    room.disconnect(a);
    clock.advance(ROOM.emptyGraceMs - 1);
    expect(join()).toBe(true);
    expect(b.of('shapes')[0].shapes).toHaveLength(1);
    room.disconnect(b);
    clock.advance(ROOM.emptyGraceMs + 1);
    expect(room.isOpen).toBe(false);
    expect(join(new FakeSocket(), 'c')).toBe(false);
  });

  it('re-creates a wiped room on resume and accepts the seed', () => {
    const r = new FakeSocket();
    expect(room.connect(r, { clientId: 'a', mode: 'resume', device: 'desktop' })).toBe(true);
    expect(r.of('welcome')[0].fresh).toBe(true);
    room.receive(r, JSON.stringify({ t: 'seed', shapes: [stroke('s1'), stroke('s2')] }));
    expect(room.shapeCount).toBe(2);
    join();
    b.clear();
    // The second device seeds too (both came back after a relay restart): only new shapes are added.
    room.receive(b, JSON.stringify({ t: 'seed', shapes: [stroke('s2'), stroke('s3', 'b')] }));
    expect(room.shapeCount).toBe(3);
    expect(r.of('ops').at(-1)?.ops).toEqual([{ o: 'put', shape: stroke('s3', 'b') }]);
  });

  it('ends the session for everyone and refuses stale resumes', () => {
    create();
    join();
    room.receive(a, JSON.stringify({ t: 'end' }));
    expect(a.of('ended')).toHaveLength(1);
    expect(b.of('ended')).toHaveLength(1);
    expect(b.closed?.code).toBe(CLOSE.ended);
    expect(room.isOpen).toBe(false);

    const stale = new FakeSocket();
    expect(room.connect(stale, { clientId: 'b', mode: 'resume', device: 'pen' })).toBe(false);
    expect(stale.closed?.code).toBe(CLOSE.ended);
    expect(join(new FakeSocket(), 'c')).toBe(false);
  });

  it('assembles image chunks, forwards them and serves them to later members', () => {
    create();
    join();
    b.clear();
    const meta = { id: 'img1', mime: 'image/png', w: 10, h: 10 };
    room.receive(a, JSON.stringify({ t: 'asset', meta, i: 0, n: 2, data: 'AAAA' }));
    room.receive(a, JSON.stringify({ t: 'asset', meta, i: 1, n: 2, data: 'BBBB' }));
    expect(b.of('asset').map((c) => c.data)).toEqual(['AAAA', 'BBBB']);

    room.disconnect(b);
    const b2 = new FakeSocket();
    join(b2);
    expect(b2.of('welcome')[0].assets).toEqual([meta]);
    room.receive(b2, JSON.stringify({ t: 'want', ids: ['img1'] }));
    expect(b2.of('asset').map((c) => c.data)).toEqual(['AAAA', 'BBBB']);
  });

  it('rejects images that are too large', () => {
    create();
    const meta = { id: 'big', mime: 'image/png', w: 10, h: 10 };
    const data = 'A'.repeat(900_000);
    for (let i = 0; i < 7; i++) room.receive(a, JSON.stringify({ t: 'asset', meta, i, n: 8, data }));
    expect(a.of('err').at(-1)?.message).toBe('Image too large');
  });

  it('drops sockets that stop sending heartbeats', () => {
    create();
    join();
    clock.advance(ROOM.heartbeatTimeoutMs - 5_000);
    room.receive(a, JSON.stringify({ t: 'ping' }));
    clock.advance(10_000);
    room.tick();
    expect(room.memberCount).toBe(1);
    expect(b.closed?.code).toBe(1001);
    expect(a.of('peer').at(-1)).toMatchObject({ on: false, peer: { id: 'b' } });
  });

  it('closes a room after a long idle time', () => {
    create();
    for (let t = 0; t < ROOM.idleMs; t += 30_000) {
      clock.advance(30_000);
      room.receive(a, JSON.stringify({ t: 'ping' }));
      room.tick();
    }
    clock.advance(30_000);
    room.tick();
    expect(a.closed?.code).toBe(CLOSE.idle);
    expect(room.isOpen).toBe(false);
  });
});
