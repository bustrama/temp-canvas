import type { Op, Shape } from '@/shared/model';
import {
  CLOSE,
  parseServerFrame,
  type AssetChunk,
  type ClientMessage,
  type Command,
  type DeviceKind,
  type JoinMode,
  type LiveEvent,
  type PeerInfo,
  type Presence,
  type ServerMessage,
} from '@/shared/protocol';
import type { AssetMeta } from '@/shared/model';

export type ConnStatus = 'connecting' | 'syncing' | 'online' | 'reconnecting' | 'paused' | 'closed';
export type FatalReason = 'full' | 'not_found' | 'taken' | 'ended' | 'replaced' | 'forbidden' | 'bad_request';

export interface RelayHandlers {
  status(s: ConnStatus, detail: { failures: number }): void;
  welcome(w: { slot: number; fresh: boolean; peers: readonly PeerInfo[]; assets: readonly AssetMeta[] }): void;
  shapes(shapes: readonly Shape[], last: boolean): void;
  ops(ops: readonly Op[]): void;
  live(from: string, e: LiveEvent): void;
  presence(from: string, p: Presence): void;
  peer(peer: PeerInfo, on: boolean): void;
  asset(chunk: AssetChunk): void;
  command(from: string, c: Command): void;
  fatal(reason: FatalReason, message: string): void;
  error(message: string): void;
}

export interface RelayOptions {
  readonly baseUrl: string;
  readonly code: string;
  readonly clientId: string;
  readonly device: DeviceKind;
  readonly mode: JoinMode;
  /** Colour slot from before a refresh, asked for again on resume. */
  readonly slot?: number;
}

const FLUSH_MS = 30;
const PING_MS = 15_000;
const SILENCE_MS = 40_000;
const MAX_FRAME_CHARS = 500_000;
const BACKOFF_MS = [250, 1000, 2000, 4000, 8000, 10_000];

const FATAL: Record<number, FatalReason> = {
  [CLOSE.full]: 'full',
  [CLOSE.notFound]: 'not_found',
  [CLOSE.taken]: 'taken',
  [CLOSE.ended]: 'ended',
  [CLOSE.replaced]: 'replaced',
  [CLOSE.forbidden]: 'forbidden',
  [CLOSE.badRequest]: 'bad_request',
};

/**
 * WebSocket connection to the relay with reconnects, batching and an outbox.
 *
 * - Committed ops stay in the outbox until acknowledged and are re-sent after a reconnect.
 * - Ephemeral messages (live strokes, presence) are batched into one frame every ~30 ms,
 *   coalesced (latest presence wins, consecutive stroke points merge) and dropped while offline.
 * - After the first successful join, reconnects use `resume`: if the relay forgot the room
 *   (everyone left, or it restarted) it comes back empty and this client re-seeds it.
 */
export class RelayClient {
  private readonly opts: RelayOptions;
  private readonly h: RelayHandlers;
  private mode: JoinMode;
  private slot: number | undefined;
  private ws: WebSocket | null = null;
  private statusValue: ConnStatus = 'closed';
  private queue: ClientMessage[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private outbox: Array<{ seq: number; ops: readonly Op[] }> = [];
  private seq = 0;
  private failures = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeard = 0;
  private stopped = false;
  private readonly disposers: Array<() => void> = [];

  constructor(opts: RelayOptions, handlers: RelayHandlers) {
    this.opts = opts;
    this.h = handlers;
    this.mode = opts.mode;
    this.slot = opts.slot;
    if (typeof window !== 'undefined') {
      const wake = () => {
        if (document.visibilityState === 'visible' && this.statusValue === 'reconnecting') this.reconnectNow();
      };
      document.addEventListener('visibilitychange', wake);
      window.addEventListener('online', wake);
      this.disposers.push(() => {
        document.removeEventListener('visibilitychange', wake);
        window.removeEventListener('online', wake);
      });
    }
  }

  get status(): ConnStatus {
    return this.statusValue;
  }

  /** Ops sent but not yet acknowledged (re-applied locally over a fresh snapshot). */
  get unacknowledged(): Op[] {
    return this.outbox.flatMap((e) => e.ops);
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.setStatus('closed');
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, 'bye');
    for (const d of this.disposers.splice(0)) d();
  }

  /** After an idle pause: reconnect on the next interaction. */
  resume(): void {
    if (this.statusValue === 'paused') this.reconnectNow();
  }

  // ---- outgoing ------------------------------------------------------------------------------

  sendOps(ops: readonly Op[]): void {
    if (ops.length === 0) return;
    const entry = { seq: ++this.seq, ops };
    this.outbox.push(entry);
    if (this.statusValue === 'online') this.enqueue({ t: 'ops', seq: entry.seq, ops }, true);
  }

  sendLive(e: LiveEvent): void {
    if (this.statusValue !== 'online') return;
    const last = this.queue[this.queue.length - 1];
    if (e.k === 'pts' && last?.t === 'live' && last.e.k === 'pts' && last.e.id === e.id) {
      this.queue[this.queue.length - 1] = { t: 'live', e: { k: 'pts', id: e.id, pts: [...last.e.pts, ...e.pts] } };
      return;
    }
    this.enqueue({ t: 'live', e }, false);
  }

  sendPresence(p: Presence): void {
    if (this.statusValue !== 'online') return;
    this.queue = this.queue.filter((m) => m.t !== 'pres');
    this.enqueue({ t: 'pres', p }, false);
  }

  /** `to`: one member only; otherwise everyone else. */
  sendCommand(c: Command, to?: string): void {
    if (this.statusValue === 'online') this.enqueue(to === undefined ? { t: 'cmd', c } : { t: 'cmd', c, to }, true);
  }

  sendAsset(chunks: readonly AssetChunk[]): void {
    if (this.statusValue !== 'online') return; // re-sent with the seed after a reconnect
    for (const c of chunks) this.enqueue(c, true);
  }

  seed(shapes: readonly Shape[]): void {
    let batch: Shape[] = [];
    let chars = 0;
    for (const s of shapes) {
      const size = JSON.stringify(s).length;
      if (batch.length > 0 && chars + size > MAX_FRAME_CHARS * 0.8) {
        this.enqueue({ t: 'seed', shapes: batch }, true);
        batch = [];
        chars = 0;
      }
      batch.push(s);
      chars += size;
    }
    if (batch.length > 0) this.enqueue({ t: 'seed', shapes: batch }, true);
  }

  want(ids: readonly string[]): void {
    if (ids.length > 0) this.enqueue({ t: 'want', ids }, true);
  }

  end(): void {
    this.enqueue({ t: 'end' }, true);
  }

  private enqueue(msg: ClientMessage, urgent: boolean): void {
    this.queue.push(msg);
    if (urgent) this.flush();
    else if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), FLUSH_MS);
  }

  private flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || this.queue.length === 0) return;
    const queue = this.queue;
    this.queue = [];
    let frame: ClientMessage[] = [];
    let chars = 0;
    const send = () => {
      if (frame.length === 0) return;
      ws.send(JSON.stringify(frame.length === 1 ? frame[0] : frame));
      frame = [];
      chars = 0;
    };
    for (const msg of queue) {
      const size = JSON.stringify(msg).length;
      if (chars + size > MAX_FRAME_CHARS) send();
      frame.push(msg);
      chars += size;
    }
    send();
  }

  // ---- connection ----------------------------------------------------------------------------

  private connect(): void {
    if (this.stopped) return;
    this.clearTimers();
    this.setStatus(this.failures > 0 || this.mode === 'resume' ? 'reconnecting' : 'connecting');
    const { baseUrl, code, clientId, device } = this.opts;
    const slot = this.mode === 'resume' && this.slot !== undefined ? `&slot=${this.slot}` : '';
    const url = `${baseUrl}/rooms/${code}/ws?mode=${this.mode}&cid=${clientId}&device=${device}${slot}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.lastHeard = Date.now();
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws || typeof ev.data !== 'string') return;
      this.lastHeard = Date.now();
      for (const msg of parseServerFrame(ev.data)) this.handle(msg);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      if (this.stopped) return;
      const fatal = FATAL[ev.code];
      if (fatal) {
        this.stopped = true;
        this.setStatus('closed');
        this.h.fatal(fatal, ev.reason);
        return;
      }
      if (ev.code === CLOSE.idle) {
        this.setStatus('paused');
        return;
      }
      this.scheduleReconnect();
    };
  }

  private handle(msg: ServerMessage): void {
    switch (msg.t) {
      case 'welcome':
        this.failures = 0;
        this.mode = 'resume';
        this.slot = msg.slot;
        this.queue = this.queue.filter((m) => m.t === 'asset'); // stale ephemeral traffic is useless now
        this.setStatus('syncing');
        this.h.welcome({ slot: msg.slot, fresh: msg.fresh, peers: msg.peers, assets: msg.assets });
        this.startPing();
        return;
      case 'shapes':
        this.h.shapes(msg.shapes, msg.last);
        if (msg.last) {
          this.setStatus('online');
          // Whatever was not acknowledged before the drop goes again (puts/deletes are idempotent).
          for (const e of this.outbox) this.enqueue({ t: 'ops', seq: e.seq, ops: e.ops }, false);
          this.flush();
        }
        return;
      case 'ack':
        this.outbox = this.outbox.filter((e) => e.seq > msg.seq);
        return;
      case 'ops':
        this.h.ops(msg.ops);
        return;
      case 'live':
        this.h.live(msg.from, msg.e);
        return;
      case 'pres':
        this.h.presence(msg.from, msg.p);
        return;
      case 'peer':
        this.h.peer(msg.peer, msg.on);
        return;
      case 'asset':
        this.h.asset(msg);
        return;
      case 'cmd':
        this.h.command(msg.from, msg.c);
        return;
      case 'err':
        this.h.error(msg.message);
        return;
      case 'ended':
      case 'pong':
      case 'asset-meta':
        return;
    }
  }

  private scheduleReconnect(): void {
    this.failures++;
    this.setStatus('reconnecting');
    const delay = BACKOFF_MS[Math.min(this.failures - 1, BACKOFF_MS.length - 1)];
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private reconnectNow(): void {
    this.failures = 0;
    if (this.ws) this.ws.close();
    this.ws = null;
    this.connect();
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws) return;
      if (Date.now() - this.lastHeard > SILENCE_MS) {
        // Half-open socket (common after a tablet sleeps): drop it and reconnect.
        this.ws = null;
        ws.onclose = null;
        ws.close();
        this.scheduleReconnect();
        return;
      }
      this.enqueue({ t: 'ping' }, true);
    }, PING_MS);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.flushTimer = null;
  }

  private setStatus(s: ConnStatus): void {
    if (this.statusValue === s && s !== 'reconnecting') return;
    this.statusValue = s;
    this.h.status(s, { failures: this.failures });
  }
}

/** Where the relay lives: NEXT_PUBLIC_RELAY_URL in production, the dev relay on this host otherwise. */
export function relayBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_RELAY_URL;
  if (configured) return configured.replace(/\/$/, '');
  const secure = location.protocol === 'https:';
  return `${secure ? 'wss' : 'ws'}://${location.hostname}:8787`;
}
