import { LIMITS, type AssetMeta } from '@/shared/model';
import type { AssetChunk } from '@/shared/protocol';

/**
 * Images on the canvas (pasted pictures, screen snapshots). Each is shared once as base64 in
 * chunks and referenced by id from image shapes.
 */

interface AssetRecord {
  readonly meta: AssetMeta;
  data: string | null;
  img: HTMLImageElement | null;
  chunks: string[] | null;
  received: number;
}

export class AssetStore {
  private readonly records = new Map<string, AssetRecord>();
  private readonly onReady: (id: string) => void;

  constructor(onReady: (id: string) => void) {
    this.onReady = onReady;
  }

  has(id: string): boolean {
    return this.records.get(id)?.data != null;
  }

  /** The decoded image, or null while it is missing or still decoding. */
  get(id: string): HTMLImageElement | null {
    return this.records.get(id)?.img ?? null;
  }

  add(meta: AssetMeta, data: string): void {
    const existing = this.records.get(meta.id);
    if (existing?.data) return;
    const rec: AssetRecord = { meta, data, img: null, chunks: null, received: 0 };
    this.records.set(meta.id, rec);
    this.decode(rec);
  }

  /** Assembles an incoming chunk; true when the asset just became complete. */
  receiveChunk(chunk: AssetChunk): boolean {
    let rec = this.records.get(chunk.meta.id);
    if (rec?.data) return false;
    if (!rec || !rec.chunks || rec.chunks.length !== chunk.n) {
      rec = { meta: chunk.meta, data: null, img: null, chunks: new Array<string>(chunk.n), received: 0 };
      this.records.set(chunk.meta.id, rec);
    }
    const chunks = rec.chunks as string[];
    if (chunks[chunk.i] === undefined) {
      chunks[chunk.i] = chunk.data;
      rec.received++;
    }
    if (rec.received < chunk.n) return false;
    rec.data = chunks.join('');
    rec.chunks = null;
    this.decode(rec);
    return true;
  }

  /** Ids in `ids` this device does not hold yet. */
  missing(ids: Iterable<string>): string[] {
    const out = new Set<string>();
    for (const id of ids) if (!this.has(id)) out.add(id);
    return [...out];
  }

  entries(ids?: ReadonlySet<string>): Array<{ meta: AssetMeta; data: string }> {
    const out: Array<{ meta: AssetMeta; data: string }> = [];
    for (const rec of this.records.values()) {
      if (rec.data && (!ids || ids.has(rec.meta.id))) out.push({ meta: rec.meta, data: rec.data });
    }
    return out;
  }

  clear(): void {
    this.records.clear();
  }

  private decode(rec: AssetRecord): void {
    if (typeof Image === 'undefined' || !rec.data) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      rec.img = img;
      this.onReady(rec.meta.id);
    };
    img.src = `data:${rec.meta.mime};base64,${rec.data}`;
  }
}

export function chunkAsset(meta: AssetMeta, data: string, size: number = LIMITS.assetChunkChars): AssetChunk[] {
  const n = Math.max(1, Math.ceil(data.length / size));
  return Array.from({ length: n }, (_, i) => ({ t: 'asset' as const, meta, i, n, data: data.slice(i * size, (i + 1) * size) }));
}

// ---- image preparation -------------------------------------------------------------------------

export interface PreparedImage {
  readonly mime: string;
  readonly w: number;
  readonly h: number;
  readonly data: string;
}

const MAX_SIDE = 2048;
const TARGET_BYTES = 3.2 * 1024 * 1024;

/** Downscales and re-encodes an image so it fits the per-image budget. */
export async function prepareImage(source: Blob | CanvasImageSource & { width: number; height: number }, maxSide = MAX_SIDE): Promise<PreparedImage> {
  const bitmap = source instanceof Blob ? await createImageBitmap(source) : source;
  const keepPng = source instanceof Blob && source.type === 'image/png';
  let scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 5; attempt++) {
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = keepPng ? await toBlob(canvas, 'image/png') : ((await toBlob(canvas, 'image/webp', 0.86)) ?? (await toBlob(canvas, 'image/jpeg', 0.86)));
    if (blob && blob.size <= TARGET_BYTES) {
      const mime = blob.type === 'image/webp' || blob.type === 'image/png' ? blob.type : 'image/jpeg';
      return { mime, w, h, data: await blobToBase64(blob) };
    }
    scale *= 0.75;
  }
  throw new Error('Image is too large');
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b && (b.type === type || type === 'image/jpeg') ? b : null), type, quality),
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// ---- screen capture ----------------------------------------------------------------------------

/** Whether this browser can capture the screen (desktop Chrome/Edge/Firefox/Safari). */
export function canCaptureScreen(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function';
}

/**
 * A screen-share stream kept open so later snapshots do not ask again. Chrome shows its own
 * "sharing" bar; stopping it there ends the stream.
 */
export class ScreenGrabber {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  onChange: (active: boolean) => void = () => {};

  get active(): boolean {
    return !!this.stream && this.stream.getVideoTracks().some((t) => t.readyState === 'live');
  }

  /** Must run inside a user gesture the first time. */
  async start(): Promise<void> {
    if (this.active) return;
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    this.stream = stream;
    this.video = video;
    for (const track of stream.getVideoTracks()) track.addEventListener('ended', () => this.stop());
    this.onChange(true);
  }

  async grab(): Promise<PreparedImage> {
    if (!this.active || !this.video) throw new Error('Screen sharing is not active');
    const video = this.video;
    if (video.readyState < 2) await new Promise((r) => video.addEventListener('loadeddata', r, { once: true }));
    // Let a fresh frame land (the video may have been idle).
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const frame = { width: video.videoWidth, height: video.videoHeight };
    const canvas = document.createElement('canvas');
    canvas.width = frame.width;
    canvas.height = frame.height;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    return prepareImage(canvas, 2560);
  }

  stop(): void {
    const was = this.active;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
    if (was) this.onChange(false);
  }
}
