'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { canCaptureScreen, prepareImage } from '@/canvas/assets';
import { Engine } from '@/canvas/Engine';
import { InputRouter, isTyping } from '@/canvas/InputRouter';
import { PalmPolicy } from '@/canvas/palmPolicy';
import { TouchNav } from '@/canvas/TouchNav';
import { generateCode } from '@/shared/code';
import { INK_COLORS } from '@/shared/model';
import type { DeviceKind } from '@/shared/protocol';
import { relayBaseUrl } from '@/sync/RelayClient';
import { SessionController } from '@/sync/SessionController';
import { markCreating } from '@/sync/storage';
import { Fatal } from './Fatal';
import { CompactToolbar } from './CompactToolbar';
import { useCompact, useEditorState, useSessionState } from './hooks';
import { PresentIcon } from './icons';
import { Notices } from './Notices';
import { TextEditor } from './TextEditor';
import { subscribeTheme } from './theme';
import { Toolbar } from './Toolbar';
import { TopBar } from './TopBar';
import { WaitingCard } from './WaitingCard';
import { ZoomControls } from './ZoomControls';

/** Tablets and phones (coarse primary pointer) draw; everything else is the "desktop" side. */
function detectDevice(): DeviceKind {
  return matchMedia('(pointer: coarse)').matches ? 'pen' : 'desktop';
}

export function Room({ code }: { code: string }) {
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [ctl, setCtl] = useState<SessionController | null>(null);
  const [device, setDevice] = useState<DeviceKind>('desktop');
  const [present, setPresent] = useState(false);
  const [waitingClosed, setWaitingClosed] = useState(false);
  const state = useEditorState(engine);
  const compact = useCompact();
  const session = useSessionState(ctl);

  // Wire engine, input, relay and storage for this code.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const dev = detectDevice();
    const controller = new SessionController({ code, device: dev, baseUrl: relayBaseUrl() });
    const eng = new Engine(host, controller.engineHooks, { clientId: controller.clientId, device: dev });
    const palm = new PalmPolicy();
    const input = new InputRouter(host, eng, palm, new TouchNav(eng, palm));
    controller.attach(eng);
    const unTheme = subscribeTheme(() => requestAnimationFrame(() => eng.refreshTheme()));
    setEngine(eng);
    setCtl(controller);
    setDevice(dev);
    return () => {
      unTheme();
      input.dispose();
      controller.dispose();
      eng.dispose();
      setEngine(null);
      setCtl(null);
    };
  }, [code]);

  const startNew = useCallback(() => {
    const next = generateCode();
    markCreating(next);
    router.push(`/s/${next}`);
  }, [router]);

  // A freshly generated code that happens to be in use: silently pick another.
  const fatal = session?.fatal?.reason;
  useEffect(() => {
    if (fatal !== 'taken') return;
    const next = generateCode();
    markCreating(next);
    router.replace(`/s/${next}`);
  }, [fatal, router]);

  const addImages = useCallback(
    async (files: Iterable<File>) => {
      if (!engine || !ctl) return;
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        try {
          engine.insertImage(await prepareImage(file));
        } catch {
          ctl.notify('That image could not be added.');
        }
      }
    },
    [engine, ctl],
  );

  // Keyboard shortcuts, paste and drop.
  useEffect(() => {
    if (!engine) return;
    const host = hostRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod) {
        if (k === 'z') engine[e.shiftKey ? 'redo' : 'undo']();
        else if (k === 'y') engine.redo();
        else if (k === 'a') engine.selectAll();
        else if (k === '0') engine.resetZoom();
        else if (k === '=' || k === '+') engine.zoomBy(1.25);
        else if (k === '-') engine.zoomBy(0.8);
        else return;
        e.preventDefault();
        return;
      }
      if (e.altKey) return;
      const s = engine.getState();
      if (k >= '1' && k <= '7') engine.setColor(INK_COLORS[Number(k) - 1]);
      else if (k === '!' || (e.shiftKey && k === '1')) engine.fitContent();
      else if (k === 'p') engine.setTool('pen');
      else if (k === 'h') engine.setTool('highlighter');
      else if (k === 'l') engine.setTool('laser');
      else if (k === 'e') engine.setTool('eraser');
      else if (k === 'v') engine.setTool('select');
      else if (k === 's') engine.setTool('geo');
      else if (k === 't') engine.setTool('text');
      else if (k === 'f') engine.toggleFollowing();
      else if (k === '.') setPresent((p) => !p);
      else if (k === '[') engine.setWidth(s.width - 1);
      else if (k === ']') engine.setWidth(s.width + 1);
      else if (k === 'delete' || k === 'backspace') engine.deleteSelection();
      else if (k === 'escape') {
        engine.clearSelection();
        setPresent(false);
      } else return;
      e.preventDefault();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e)) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length > 0) {
        e.preventDefault();
        void addImages(files);
        return;
      }
      const text = e.clipboardData?.getData('text/plain');
      if (text?.trim()) {
        e.preventDefault();
        engine.insertText(text);
      }
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.files.length) void addImages(e.dataTransfer.files);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    host?.addEventListener('dragover', onDragOver);
    host?.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
      host?.removeEventListener('dragover', onDragOver);
      host?.removeEventListener('drop', onDrop);
    };
  }, [engine, addImages]);

  const ready = engine && ctl && state && session;
  const Bar = compact ? CompactToolbar : Toolbar;
  const desktopCapture = device === 'desktop' && typeof navigator !== 'undefined' && canCaptureScreen();
  const desktopOnline = !!state?.peers.some((p) => p.online && p.device === 'desktop');
  const canSnapshot = desktopCapture || (device === 'pen' && desktopOnline);
  const showWaiting = ready && session.status === 'online' && state.peers.length === 0 && !waitingClosed && !present;

  return (
    <div className="fixed inset-0 overflow-hidden" onPointerDownCapture={() => session?.status === 'paused' && ctl?.wake()}>
      <div ref={hostRef} className="canvas-host" data-tool={state?.tool} />

      {ready && !session.fatal && (
        <>
          {state.textEdit && <TextEditor key={state.textEdit.id} engine={engine} edit={state.textEdit} />}
          {!present && (
            <>
              <TopBar code={code} engine={engine} state={state} session={session} device={device} compact={compact} onPresent={() => setPresent(true)} onEnd={() => ctl.endSession()} />
              <Bar
                engine={engine}
                state={state}
                canSnapshot={canSnapshot}
                snapshotLabel={device === 'pen' ? 'Snapshot of the desktop screen' : session.sharingScreen ? 'Snapshot the shared screen (right-click to stop sharing)' : 'Share your screen and snapshot it'}
                sharingScreen={session.sharingScreen}
                onImage={(files) => void addImages(files)}
                onSnapshot={() => {
                  if (device === 'pen') ctl.requestSnapshot();
                  else if (session.sharingScreen) void ctl.snapshot().catch(() => ctl.notify('Could not capture the screen.'));
                  else void ctl.shareScreenAndSnapshot();
                }}
                onStopSharing={() => ctl.stopScreenShare()}
              />
              <ZoomControls engine={engine} zoom={state.zoom} />
            </>
          )}
          {showWaiting && <WaitingCard code={code} compact={compact} onClose={() => setWaitingClosed(true)} />}
          <Notices ctl={ctl} session={session} hidden={present} />
          {present && (
            <button
              type="button"
              onClick={() => setPresent(false)}
              aria-label="Show the interface (.)"
              title="Show the interface (.)"
              className="glass absolute bottom-3 left-3 rounded-xl p-2 opacity-30 transition-opacity hover:opacity-100 focus:opacity-100"
            >
              <PresentIcon />
            </button>
          )}
        </>
      )}

      {session?.fatal && (
        <div className="absolute inset-0 z-30 bg-bg">
          <Fatal code={code} reason={session.fatal.reason} onStartNew={startNew} />
        </div>
      )}
    </div>
  );
}
