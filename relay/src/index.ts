import { DurableObject } from 'cloudflare:workers';
import { isValidCode } from '../../src/shared/code';
import type { DeviceKind, JoinMode } from '../../src/shared/protocol';
import { RoomCore, type RoomSocket } from './room';

/**
 * Relay for temp-canvas. One Durable Object per invite code holds that session in memory and
 * passes messages between its (at most two) members. Nothing is written to storage.
 *
 *   GET /health
 *   GET /rooms/:code/ws?mode=create|join|resume&cid=<client id>&device=pen|desktop[&slot=<n>]  (WebSocket)
 */

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  /** Comma-separated origins allowed to open sockets; `*` matches within a host/port. */
  ALLOWED_ORIGINS?: string;
}

const MODES: readonly JoinMode[] = ['create', 'join', 'resume'];
const TICK_MS = 15_000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (url.pathname === '/health') return new Response('ok', { headers: corsHeaders(origin, env) });

    const match = /^\/rooms\/([^/]+)\/ws$/.exec(url.pathname);
    if (!match) return new Response('Not found', { status: 404 });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    if (!originAllowed(origin, env.ALLOWED_ORIGINS)) return new Response('Origin not allowed', { status: 403 });

    const code = match[1];
    const mode = url.searchParams.get('mode') as JoinMode | null;
    const cid = url.searchParams.get('cid') ?? '';
    const device = url.searchParams.get('device');
    if (!isValidCode(code) || !mode || !MODES.includes(mode) || !/^[0-9a-z]{6,64}$/.test(cid) || (device !== 'pen' && device !== 'desktop')) {
      return new Response('Bad request', { status: 400 });
    }

    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    return stub.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export class Room extends DurableObject<Env> {
  private readonly core = new RoomCore({
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  });
  private ticker: ReturnType<typeof setInterval> | null = null;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // Not the hibernation API: the room lives in memory only, so the object must stay awake while
    // members are connected (the idle cutoff in RoomCore bounds how long that can be).
    server.accept();

    const sock: RoomSocket = {
      send: (data) => server.send(data),
      close: (code, reason) => server.close(code, reason.slice(0, 120)),
    };
    const joined = this.core.connect(sock, {
      clientId: url.searchParams.get('cid') as string,
      mode: url.searchParams.get('mode') as JoinMode,
      device: url.searchParams.get('device') as DeviceKind,
      slot: url.searchParams.has('slot') ? Number(url.searchParams.get('slot')) : undefined,
    });

    if (joined) {
      server.addEventListener('message', (event) => {
        if (typeof event.data === 'string') this.core.receive(sock, event.data);
      });
      const gone = () => {
        this.core.disconnect(sock);
        this.syncTicker();
      };
      server.addEventListener('close', () => {
        // Complete the closing handshake.
        try {
          server.close(1000, 'Bye');
        } catch {
          // already closed
        }
        gone();
      });
      server.addEventListener('error', gone);
    }
    this.syncTicker();
    return new Response(null, { status: 101, webSocket: client });
  }

  private syncTicker(): void {
    if (this.core.memberCount > 0 && !this.ticker) {
      this.ticker = setInterval(() => {
        this.core.tick();
        this.syncTicker();
      }, TICK_MS);
    } else if (this.core.memberCount === 0 && this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }
}

/**
 * `allowed` is a comma-separated list of origins. `*` stands for one host label or a port
 * (`https://temp-canvas-*.vercel.app`, `http://localhost:*`). The word `private` allows plain-http
 * origins on localhost and private IPv4 addresses (local development on the LAN).
 */
export function originAllowed(origin: string | null, allowed: string | undefined): boolean {
  if (!origin) return false;
  const patterns = (allowed ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  return patterns.some((p) => (p === 'private' ? PRIVATE_ORIGIN : globToRegExp(p)).test(origin));
}

const PRIVATE_ORIGIN =
  /^https?:\/\/(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d{1,5})?$/;

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/.:]*');
  return new RegExp(`^${escaped}$`);
}

function corsHeaders(origin: string | null, env: Env): HeadersInit {
  return originAllowed(origin, env.ALLOWED_ORIGINS) && origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}
