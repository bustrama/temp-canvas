import { LIMITS, type AssetMeta, type Op, type Shape } from '../../src/shared/model';
import {
  CLOSE,
  MAX_MEMBERS,
  parseClientFrame,
  type AssetChunk,
  type ClientMessage,
  type CloseCode,
  type DeviceKind,
  type JoinMode,
  type PeerInfo,
  type Presence,
  type ServerMessage,
} from '../../src/shared/protocol';

/**
 * One session's state machine, free of Cloudflare APIs so it can be unit tested. The Durable
 * Object feeds it sockets and frames; timers come from the injected clock.
 *
 * Nothing here is persisted. The room lives in memory while someone is connected (plus a short
 * grace period so a refresh does not end the session); after that it is wiped.
 */

export interface RoomSocket {
  send(data: string): void;
  close(code: number, reason: string): void;
}

export interface RoomClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const ROOM = {
  maxMembers: MAX_MEMBERS,
  /** After the last member leaves, the room still accepts joins for this long, then it is wiped. */
  emptyGraceMs: 60_000,
  /** A socket silent for this long (clients ping every 15 s) is dropped. */
  heartbeatTimeoutMs: 45_000,
  /** No drawing, cursor or edit activity for this long closes the room (bounds Durable Object time). */
  idleMs: 3 * 60 * 60_000,
  /** After End session, a stale device trying to resume is told the session ended. */
  endedMemoryMs: 30 * 60_000,
  /** Shapes per `shapes` batch, bounded by serialized size. */
  batchChars: 400_000,
} as const;

interface Member {
  readonly id: string;
  readonly device: DeviceKind;
  readonly slot: number;
  readonly sock: RoomSocket;
  lastSeen: number;
  pres: Presence | null;
}

interface StoredAsset {
  meta: AssetMeta;
  chunks: string[];
  received: number;
  n: number;
  chars: number;
}

export interface JoinRequest {
  readonly clientId: string;
  readonly mode: JoinMode;
  readonly device: DeviceKind;
  /** The colour slot this client had before (kept across a relay restart when still free). */
  readonly slot?: number;
}

export class RoomCore {
  private open = false;
  private endedAt = -Infinity;
  private readonly members = new Map<string, Member>();
  private readonly shapes = new Map<string, Shape>();
  private readonly assets = new Map<string, StoredAsset>();
  private assetChars = 0;
  private wipeTimer: unknown = null;
  private lastActivity: number;
  private readonly clock: RoomClock;
  private readonly cfg: typeof ROOM;

  constructor(clock: RoomClock, cfg: typeof ROOM = ROOM) {
    this.clock = clock;
    this.cfg = cfg;
    this.lastActivity = clock.now();
  }

  get isOpen(): boolean {
    return this.open;
  }

  get memberCount(): number {
    return this.members.size;
  }

  get shapeCount(): number {
    return this.shapes.size;
  }

  // ---- connection lifecycle ------------------------------------------------------------------

  connect(sock: RoomSocket, req: JoinRequest): boolean {
    const now = this.clock.now();
    const existing = this.members.get(req.clientId);
    let fresh = false;

    if (req.mode === 'create') {
      if (this.open) return this.reject(sock, CLOSE.taken, 'That code is in use');
      fresh = true;
    } else if (!this.open) {
      if (req.mode === 'join') return this.reject(sock, CLOSE.notFound, 'No session with that code');
      if (now - this.endedAt < this.cfg.endedMemoryMs) return this.reject(sock, CLOSE.ended, 'This session was ended');
      fresh = true; // resume: the room was wiped (or the relay restarted); the client re-seeds it
    } else if (!existing && this.members.size >= this.cfg.maxMembers) {
      return this.reject(sock, CLOSE.full, 'This session is full');
    }

    if (fresh) {
      this.wipe();
      this.open = true;
      this.endedAt = -Infinity;
    }
    this.cancelWipe();
    if (existing) {
      // Same tab reconnecting (or a stale socket we have not noticed dying yet): the new one wins.
      this.members.delete(existing.id);
      safeClose(existing.sock, CLOSE.replaced, 'Reconnected elsewhere');
    }

    const slot = existing?.slot ?? this.freeSlot(req.slot);
    const member: Member = { id: req.clientId, device: req.device, slot, sock, lastSeen: now, pres: existing?.pres ?? null };
    this.members.set(member.id, member);
    this.lastActivity = now;

    this.send(member, {
      t: 'welcome',
      you: member.id,
      slot,
      fresh,
      peers: this.others(member).map(peerInfo),
      assets: [...this.assets.values()].filter(isComplete).map((a) => a.meta),
    });
    this.sendShapes(member);
    if (!existing) this.broadcast(member, { t: 'peer', peer: peerInfo(member), on: true });
    return true;
  }

  disconnect(sock: RoomSocket): void {
    const member = this.memberBySocket(sock);
    if (!member) return; // already replaced or removed
    this.members.delete(member.id);
    this.broadcast(member, { t: 'peer', peer: peerInfo(member), on: false });
    if (this.members.size === 0) this.scheduleWipe();
  }

  receive(sock: RoomSocket, raw: string): void {
    const member = this.memberBySocket(sock);
    if (!member) return;
    const now = this.clock.now();
    member.lastSeen = now;
    if (raw.length > LIMITS.maxMessageChars) {
      this.send(member, { t: 'err', code: CLOSE.badRequest, message: 'Message too large' });
      return;
    }
    const forward: ServerMessage[] = [];
    for (const msg of parseClientFrame(raw)) {
      if (msg.t !== 'ping') this.lastActivity = now;
      this.handle(member, msg, forward);
      if (!this.members.has(member.id)) return; // ended mid-frame
    }
    if (forward.length > 0) this.broadcastMany(member, forward);
  }

  /** Called periodically: drops dead sockets and closes an idle room. */
  tick(): void {
    const now = this.clock.now();
    for (const m of [...this.members.values()]) {
      if (now - m.lastSeen > this.cfg.heartbeatTimeoutMs) {
        safeClose(m.sock, 1001, 'Heartbeat timeout');
        this.disconnect(m.sock);
      }
    }
    if (this.members.size > 0 && now - this.lastActivity > this.cfg.idleMs) {
      for (const m of [...this.members.values()]) {
        this.members.delete(m.id);
        safeClose(m.sock, CLOSE.idle, 'Paused after a long idle time');
      }
      this.wipe();
    }
  }

  // ---- messages ------------------------------------------------------------------------------

  private handle(member: Member, msg: ClientMessage, forward: ServerMessage[]): void {
    switch (msg.t) {
      case 'ping':
        this.send(member, { t: 'pong' });
        return;
      case 'ops': {
        const applied = this.applyOps(msg.ops);
        if (applied.length > 0) forward.push({ t: 'ops', ops: applied });
        this.send(member, { t: 'ack', seq: msg.seq });
        return;
      }
      case 'seed': {
        const added: Op[] = [];
        for (const shape of msg.shapes) {
          if (this.shapes.has(shape.id) || this.shapes.size >= LIMITS.maxShapes) continue;
          this.shapes.set(shape.id, shape);
          added.push({ o: 'put', shape });
        }
        if (added.length > 0) forward.push({ t: 'ops', ops: added });
        return;
      }
      case 'live':
        forward.push({ t: 'live', from: member.id, e: msg.e });
        return;
      case 'pres':
        member.pres = msg.p;
        forward.push({ t: 'pres', from: member.id, p: msg.p });
        return;
      case 'cmd': {
        const cmd: ServerMessage = { t: 'cmd', from: member.id, c: msg.c };
        if (msg.to === undefined) forward.push(cmd);
        else {
          const target = this.members.get(msg.to);
          if (target && target !== member) this.send(target, cmd);
        }
        return;
      }
      case 'asset':
        this.storeChunk(member, msg, forward);
        return;
      case 'want':
        for (const id of msg.ids) this.sendAsset(member, id);
        return;
      case 'end':
        this.end();
        return;
    }
  }

  private applyOps(ops: readonly Op[]): Op[] {
    const applied: Op[] = [];
    for (const op of ops) {
      if (op.o === 'put') {
        if (!this.shapes.has(op.shape.id) && this.shapes.size >= LIMITS.maxShapes) continue;
        this.shapes.set(op.shape.id, op.shape);
      } else {
        this.shapes.delete(op.id);
      }
      applied.push(op);
    }
    return applied;
  }

  private storeChunk(member: Member, chunk: AssetChunk, forward: ServerMessage[]): void {
    const { meta } = chunk;
    let asset = this.assets.get(meta.id);
    if (asset && isComplete(asset)) return; // already have it (e.g. both devices seeding)
    if (!asset || asset.n !== chunk.n) {
      if (asset) this.dropAsset(asset);
      asset = { meta, chunks: new Array<string>(chunk.n), received: 0, n: chunk.n, chars: 0 };
      this.assets.set(meta.id, asset);
    }
    if (asset.chunks[chunk.i] !== undefined) return;
    const tooBig = asset.chars + chunk.data.length > (LIMITS.maxAssetBytes * 4) / 3 + 1024;
    const roomFull = this.assetChars + chunk.data.length > (LIMITS.maxRoomAssetBytes * 4) / 3;
    if (tooBig || roomFull) {
      this.dropAsset(asset);
      this.send(member, { t: 'err', code: CLOSE.badRequest, message: tooBig ? 'Image too large' : 'Session image space is full' });
      return;
    }
    asset.chunks[chunk.i] = chunk.data;
    asset.received++;
    asset.chars += chunk.data.length;
    this.assetChars += chunk.data.length;
    forward.push(chunk);
  }

  private dropAsset(asset: StoredAsset): void {
    this.assetChars -= asset.chars;
    this.assets.delete(asset.meta.id);
  }

  private sendAsset(member: Member, id: string): void {
    const asset = this.assets.get(id);
    if (!asset || !isComplete(asset)) return;
    for (let i = 0; i < asset.n; i++) {
      this.send(member, { t: 'asset', meta: asset.meta, i, n: asset.n, data: asset.chunks[i] });
    }
  }

  private sendShapes(member: Member): void {
    let batch: Shape[] = [];
    let chars = 0;
    for (const shape of this.shapes.values()) {
      const size = JSON.stringify(shape).length;
      if (batch.length > 0 && chars + size > this.cfg.batchChars) {
        this.send(member, { t: 'shapes', shapes: batch, last: false });
        batch = [];
        chars = 0;
      }
      batch.push(shape);
      chars += size;
    }
    this.send(member, { t: 'shapes', shapes: batch, last: true });
  }

  private end(): void {
    for (const m of [...this.members.values()]) {
      this.send(m, { t: 'ended' });
      this.members.delete(m.id);
      safeClose(m.sock, CLOSE.ended, 'Session ended');
    }
    this.wipe();
    this.endedAt = this.clock.now();
  }

  // ---- helpers -------------------------------------------------------------------------------

  private reject(sock: RoomSocket, code: CloseCode, message: string): false {
    try {
      sock.send(JSON.stringify({ t: 'err', code, message } satisfies ServerMessage));
    } catch {
      // socket already gone
    }
    safeClose(sock, code, message);
    return false;
  }

  private wipe(): void {
    this.cancelWipe();
    this.open = false;
    this.shapes.clear();
    this.assets.clear();
    this.assetChars = 0;
  }

  private scheduleWipe(): void {
    this.cancelWipe();
    this.wipeTimer = this.clock.setTimeout(() => {
      this.wipeTimer = null;
      if (this.members.size === 0) this.wipe();
    }, this.cfg.emptyGraceMs);
  }

  private cancelWipe(): void {
    if (this.wipeTimer !== null) {
      this.clock.clearTimeout(this.wipeTimer);
      this.wipeTimer = null;
    }
  }

  private memberBySocket(sock: RoomSocket): Member | undefined {
    for (const m of this.members.values()) if (m.sock === sock) return m;
    return undefined;
  }

  private freeSlot(preferred?: number): number {
    const used = new Set([...this.members.values()].map((m) => m.slot));
    if (preferred !== undefined && Number.isInteger(preferred) && preferred >= 0 && preferred < this.cfg.maxMembers && !used.has(preferred)) return preferred;
    let slot = 0;
    while (used.has(slot)) slot++;
    return slot;
  }

  private others(member: Member): Member[] {
    return [...this.members.values()].filter((m) => m !== member);
  }

  private send(member: Member, msg: ServerMessage): void {
    try {
      member.sock.send(JSON.stringify(msg));
    } catch {
      // closed underneath us; the close event cleans up
    }
  }

  private broadcast(from: Member, msg: ServerMessage): void {
    for (const m of this.others(from)) this.send(m, msg);
  }

  private broadcastMany(from: Member, msgs: ServerMessage[]): void {
    const data = JSON.stringify(msgs.length === 1 ? msgs[0] : msgs);
    for (const m of this.others(from)) {
      try {
        m.sock.send(data);
      } catch {
        // closed underneath us
      }
    }
  }
}

function peerInfo(m: Member): PeerInfo {
  return { id: m.id, device: m.device, slot: m.slot, pres: m.pres };
}

function isComplete(a: StoredAsset): boolean {
  return a.received === a.n;
}

function safeClose(sock: RoomSocket, code: number, reason: string): void {
  try {
    sock.close(code, reason);
  } catch {
    // already closed
  }
}
