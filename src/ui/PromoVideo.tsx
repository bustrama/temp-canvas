'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { CloseIcon, PlayIcon } from './icons';

const VIDEO = '/promo/temp-canvas.mp4';
const POSTER = '/promo/poster.jpg';

/**
 * A "see how it works" row that plays the product video in a modal. The video only loads once it
 * is opened; closing it pauses, and opening it again carries on from there.
 */
export function PromoVideo() {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  const open = () => {
    dialog.current?.showModal();
    // Opened by a click, so it may start with sound. If the browser still says no, the controls are there.
    video.current?.play().catch(() => {});
  };
  // Escape closes the dialog on its own; onClose pauses in that case.
  const close = () => {
    video.current?.pause();
    dialog.current?.close();
  };

  return (
    <>
      <button type="button" onClick={open} className="group mx-auto mt-4 flex w-fit items-center gap-4 rounded-2xl p-2 pr-4 text-left transition hover:bg-surface-2">
        <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2">
          <Image src={POSTER} alt="" width={1280} height={720} sizes="96px" className="h-full w-full object-cover" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white transition group-hover:scale-110">
              <PlayIcon size={14} />
            </span>
          </span>
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">See how it works</span>
          <span className="block text-sm text-muted">A 20-second tour</span>
        </span>
      </button>

      <dialog
        ref={dialog}
        aria-label="temp canvas product tour"
        onClose={() => video.current?.pause()}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="m-auto flex-col gap-2 overflow-visible bg-transparent p-0 backdrop:bg-black/75 backdrop:backdrop-blur-sm open:flex"
        style={{ width: 'min(960px, calc(100vw - 2rem), calc((100dvh - 5rem) * 16 / 9))', maxWidth: 'none' }}
      >
        <button type="button" onClick={close} className="flex items-center gap-1.5 self-end rounded-full px-3 py-1.5 text-sm font-semibold text-white/85 transition hover:bg-white/10 hover:text-white">
          <CloseIcon size={16} />
          Close
        </button>
        <video ref={video} src={VIDEO} poster={POSTER} controls playsInline preload="none" className="aspect-video w-full rounded-2xl bg-black shadow-2xl" />
      </dialog>
    </>
  );
}
