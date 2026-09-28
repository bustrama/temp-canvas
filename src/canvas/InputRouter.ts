import type { Engine, PointerKind, Sample } from './Engine';
import type { PalmPolicy } from './palmPolicy';
import type { TouchNav } from './TouchNav';

/** Pen eraser end (buttons bit 32 / button 5) or barrel button (bit 2 / button 2). */
export function isEraserInput(e: PointerEvent): boolean {
  return (e.buttons & 32) !== 0 || e.button === 5 || (e.buttons & 2) !== 0 || e.button === 2;
}

/** A finger stroke this young is abandoned when a second finger lands (it was a pinch). */
const FINGER_STROKE_PINCH_MS = 250;

/**
 * The single gatekeeper between the DOM and the engine (capture-phase listeners on the host),
 * ported from draw-a-chart:
 *
 * - pen   -> draws with the current tool (eraser end / barrel button erase). Explicit pointer
 *            capture, because WebKit does not capture Apple Pencil pointers implicitly.
 * - touch -> navigates (pan, pinch, two-finger undo) with palm rejection. Until a pen has been
 *            seen, a single finger draws instead, so a phone or a pen-less tablet still works.
 * - mouse -> left button uses the tool (Space held or the hand tool pans); middle/right pan.
 * - wheel -> pans; with Ctrl/Cmd (and trackpad pinch) zooms at the cursor.
 * - Touch Events, context menus, text selection and Safari's gesture events are blocked.
 */
export class InputRouter {
  private readonly host: HTMLElement;
  private readonly engine: Engine;
  private readonly palm: PalmPolicy;
  private readonly nav: TouchNav;
  private readonly disposers: Array<() => void> = [];
  private readonly penContacts = new Set<number>();
  private fingerStroke: { id: number; startedAt: number; x: number; y: number } | null = null;
  /** Touches that are neither drawing nor navigating (a second finger during a finger stroke). */
  private readonly ignoredTouches = new Set<number>();
  private rect: DOMRect | null = null;
  private spaceHeld = false;
  private lastPenEventAt = -Infinity;

  constructor(host: HTMLElement, engine: Engine, palm: PalmPolicy, nav: TouchNav) {
    this.host = host;
    this.engine = engine;
    this.palm = palm;
    this.nav = nav;
    const capture = { capture: true, passive: false } as const;

    this.listen(host, 'pointerdown', this.onDown as EventListener, capture);
    this.listen(host, 'pointermove', this.onMove as EventListener, capture);
    this.listen(host, 'pointerup', this.onUp as EventListener, capture);
    this.listen(host, 'pointercancel', this.onCancel as EventListener, capture);
    this.listen(host, 'lostpointercapture', this.onLostCapture as EventListener, capture);
    this.listen(host, 'pointerleave', this.onLeave as EventListener, capture);
    for (const type of ['pointerover', 'pointerenter']) this.listen(host, type, this.notePen as EventListener, capture);
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) this.listen(host, type, this.block, capture);
    for (const type of ['mousedown', 'mouseup', 'click', 'dblclick', 'auxclick']) this.listen(host, type, this.onMouseCompat as EventListener, capture);
    this.listen(host, 'contextmenu', this.block, capture);
    this.listen(host, 'selectstart', this.block, capture);
    this.listen(host, 'dragstart', this.block, capture);
    this.listen(host, 'wheel', this.onWheel as EventListener, capture);
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) this.listen(document, type, this.block, { passive: false });
    // A pen lifted outside the host must not stay "down" and lock out fingers.
    this.listen(window, 'pointerup', this.onWindowPenEnd as EventListener, { capture: true, passive: true });
    this.listen(window, 'pointercancel', this.onWindowPenEnd as EventListener, { capture: true, passive: true });
    this.listen(window, 'blur', this.interruptAll, { passive: true });
    this.listen(document, 'visibilitychange', this.onVisibility, { passive: true });
    this.listen(window, 'resize', this.invalidateRect, { passive: true });
    this.listen(window, 'scroll', this.invalidateRect, { passive: true, capture: true });
    this.listen(window, 'keydown', this.onKeyDown as EventListener, { passive: true });
    this.listen(window, 'keyup', this.onKeyUp as EventListener, { passive: true });
  }

  dispose(): void {
    this.interruptAll();
    for (const d of this.disposers.splice(0)) d();
  }

  // ---- pointer events ------------------------------------------------------------------------

  private readonly onDown = (e: PointerEvent): void => {
    this.rect = null;
    const s = this.sample(e);
    const now = e.timeStamp;

    if (e.pointerType === 'pen') {
      e.preventDefault();
      e.stopPropagation();
      this.lastPenEventAt = now;
      if (!this.engine.hasSession) this.penContacts.clear();
      this.penContacts.add(e.pointerId);
      this.palm.penDown();
      this.nav.penLanded(now);
      // A finger "stroke" going on when the pen lands was the palm: throw it away.
      if (this.fingerStroke) {
        this.engine.pointerCancel(this.fingerStroke.id, true);
        this.fingerStroke = null;
      }
      this.capture(e.pointerId);
      if (!this.engine.hasSession) this.engine.pointerDown(e.pointerId, s, 'pen', { eraser: isEraserInput(e) });
      return;
    }

    if (e.pointerType === 'touch') {
      e.preventDefault();
      this.capture(e.pointerId);
      if (this.fingerStroke) {
        if (now - this.fingerStroke.startedAt < FINGER_STROKE_PINCH_MS) {
          // Two fingers almost together: a pinch, not a stroke.
          const first = this.fingerStroke;
          this.fingerStroke = null;
          this.engine.pointerCancel(first.id, true);
          this.nav.down(first.id, { x: first.x, y: first.y, width: 1, height: 1 }, now);
          this.nav.down(e.pointerId, contact(e, s), now);
        } else {
          this.ignoredTouches.add(e.pointerId);
        }
        return;
      }
      if (this.engine.fingerDrawsNow() && this.nav.count === 0 && !this.engine.hasSession) {
        this.fingerStroke = { id: e.pointerId, startedAt: now, x: s.x, y: s.y };
        this.engine.pointerDown(e.pointerId, s, 'touch');
        return;
      }
      this.nav.down(e.pointerId, contact(e, s), now);
      return;
    }

    // Mouse (or an unknown pointer type, treated like one).
    if (this.engine.hasSession) return;
    e.preventDefault();
    this.capture(e.pointerId);
    const pan = e.button === 1 || e.button === 2 || this.spaceHeld;
    if (e.button === 0 || pan) this.engine.pointerDown(e.pointerId, s, 'mouse', { pan });
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerType === 'pen') this.lastPenEventAt = e.timeStamp;
    if (this.engine.isActive(e.pointerId)) {
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        // Button released outside the window without a pointerup.
        this.finish(e, false);
        return;
      }
      if (this.fingerStroke?.id === e.pointerId) {
        const s = this.sample(e);
        this.fingerStroke.x = s.x;
        this.fingerStroke.y = s.y;
      }
      const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      const samples = (coalesced.length > 0 ? coalesced : [e]).map((ev) => this.sample(ev));
      const predicted = typeof e.getPredictedEvents === 'function' ? e.getPredictedEvents().map((ev) => this.sample(ev)) : [];
      this.engine.pointerMove(e.pointerId, samples, predicted);
      return;
    }
    if (e.pointerType === 'pen') {
      if (e.buttons === 0) {
        // Hover (Apple Pencil hover / S Pen Air View): the hand is about to land.
        this.palm.penHover(e.timeStamp);
        this.engine.pointerHover(this.sample(e), 'pen');
      }
      return;
    }
    if (e.pointerType === 'touch') {
      if (this.ignoredTouches.has(e.pointerId)) return;
      const s = this.sample(e);
      this.nav.move(e.pointerId, s.x, s.y);
      return;
    }
    this.engine.pointerHover(this.sample(e), 'mouse');
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (this.engine.isActive(e.pointerId)) {
      e.preventDefault();
      e.stopPropagation();
      this.finish(e, false);
    }
    if (e.pointerType === 'pen') this.releasePen(e.pointerId, e.timeStamp);
    else if (e.pointerType === 'touch') {
      if (this.fingerStroke?.id === e.pointerId) this.fingerStroke = null;
      if (!this.ignoredTouches.delete(e.pointerId)) this.nav.up(e.pointerId, e.timeStamp);
    }
  };

  private readonly onCancel = (e: PointerEvent): void => {
    if (this.engine.isActive(e.pointerId)) this.finish(e, true);
    if (e.pointerType === 'pen') this.releasePen(e.pointerId, e.timeStamp);
    else if (e.pointerType === 'touch') {
      if (this.fingerStroke?.id === e.pointerId) this.fingerStroke = null;
      if (!this.ignoredTouches.delete(e.pointerId)) this.nav.cancel(e.pointerId, e.timeStamp);
    }
  };

  private readonly onLostCapture = (e: PointerEvent): void => {
    // Capture lost without pointerup/pointercancel (element removed, OS interruption).
    if (this.engine.isActive(e.pointerId)) {
      this.finish(e, true);
      if (e.pointerType === 'pen') this.releasePen(e.pointerId, e.timeStamp);
    }
  };

  private readonly onLeave = (e: PointerEvent): void => {
    if (e.target !== this.host || e.pointerType === 'touch') return;
    this.engine.pointerHover(null, e.pointerType === 'pen' ? 'pen' : 'mouse');
  };

  private readonly notePen = (e: PointerEvent): void => {
    if (e.pointerType === 'pen') this.lastPenEventAt = e.timeStamp;
  };

  private readonly onWindowPenEnd = (e: PointerEvent): void => {
    if (e.pointerType !== 'pen' || !this.penContacts.has(e.pointerId)) return;
    if (this.host.contains(e.target as Node)) return; // handled by the host listeners
    if (this.engine.isActive(e.pointerId)) this.finish(e, e.type === 'pointercancel');
    this.releasePen(e.pointerId, e.timeStamp);
  };

  private finish(e: PointerEvent, cancelled: boolean): void {
    if (this.fingerStroke?.id === e.pointerId) this.fingerStroke = null;
    if (cancelled) this.engine.pointerCancel(e.pointerId);
    else this.engine.pointerUp(e.pointerId, this.sample(e));
    try {
      if (this.host.hasPointerCapture(e.pointerId)) this.host.releasePointerCapture(e.pointerId);
    } catch {
      // pointer already gone
    }
  }

  private releasePen(pointerId: number, now: number): void {
    this.penContacts.delete(pointerId);
    if (this.penContacts.size === 0) this.palm.penUp(now);
  }

  // ---- other events --------------------------------------------------------------------------

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (this.engine.hasSession) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.host.clientHeight : 1;
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    if (e.ctrlKey || e.metaKey) {
      const { x, y } = this.local(e);
      this.engine.zoomAt(Math.exp(-dy * 0.0025), x, y);
    } else if (e.shiftKey && dx === 0) {
      this.engine.panBy(-dy, 0);
    } else {
      this.engine.panBy(-dx, -dy);
    }
  };

  private readonly onMouseCompat = (e: MouseEvent): void => {
    // Compatibility mouse events that follow pen/touch input must not act as clicks.
    const fromPen = this.palm.penRecentlyActive(e.timeStamp) || e.timeStamp - this.lastPenEventAt < 50;
    if (fromPen && e.cancelable) e.preventDefault();
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'Space' || isTyping(e)) return;
    this.spaceHeld = true;
    this.host.dataset.panning = 'true';
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.code !== 'Space') return;
    this.spaceHeld = false;
    delete this.host.dataset.panning;
  };

  private readonly block = (e: Event): void => {
    if (e.cancelable) e.preventDefault();
  };

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.interruptAll();
  };

  /** Lost focus/visibility mid-interaction: finish cleanly so nothing stays stuck. */
  private readonly interruptAll = (): void => {
    this.fingerStroke = null;
    this.ignoredTouches.clear();
    this.spaceHeld = false;
    if (this.penContacts.size > 0) {
      this.penContacts.clear();
      this.palm.penUp(performance.now());
    }
    this.nav.reset();
  };

  private readonly invalidateRect = (): void => {
    this.rect = null;
  };

  // ---- helpers -------------------------------------------------------------------------------

  private listen(target: EventTarget, type: string, fn: EventListener, options: AddEventListenerOptions): void {
    target.addEventListener(type, fn, options);
    this.disposers.push(() => target.removeEventListener(type, fn, options));
  }

  private capture(pointerId: number): void {
    try {
      this.host.setPointerCapture(pointerId);
    } catch {
      // synthetic/unknown pointer ids cannot be captured
    }
  }

  private local(e: MouseEvent): { x: number; y: number } {
    if (!this.rect) this.rect = this.host.getBoundingClientRect();
    return { x: e.clientX - this.rect.left, y: e.clientY - this.rect.top };
  }

  private sample(e: PointerEvent): Sample {
    const { x, y } = this.local(e);
    return { x, y, pressure: e.pressure, time: e.timeStamp, ...(e.shiftKey ? { shift: true } : {}) };
  }
}

function contact(e: PointerEvent, s: { x: number; y: number }) {
  return { x: s.x, y: s.y, width: e.width, height: e.height };
}

export function isTyping(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

export type { PointerKind };
