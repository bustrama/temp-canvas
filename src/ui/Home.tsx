'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CODE_LENGTH, generateCode, isValidCode, normalizeCode } from '@/shared/code';
import { MAX_MEMBERS } from '@/shared/protocol';
import { markCreating } from '@/sync/storage';
import { DesktopIcon, TabletIcon } from './icons';
import { ThemeToggle } from './ThemeToggle';

export function Home() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const valid = isValidCode(code);

  const start = () => {
    const next = generateCode();
    markCreating(next);
    router.push(`/s/${next}`);
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (valid) router.push(`/s/${code}`);
  };

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center gap-2" aria-hidden="true">
            {['bg-rose', 'bg-peach', 'bg-lemon', 'bg-mint', 'bg-sky', 'bg-lilac'].map((c) => (
              <span key={c} className={`h-3 w-3 rounded-full ${c}`} />
            ))}
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">temp canvas</h1>
          <p className="mt-3 text-balance text-muted">Draw on your tablet with the pen. It shows up live on your computer, ready to share on screen.</p>
        </div>

        <div className="glass rounded-3xl p-6">
          <button
            type="button"
            onClick={start}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-5 py-4 text-lg font-semibold text-white transition hover:brightness-105 active:scale-[0.99]"
          >
            <DesktopIcon size={22} />
            Start a session
          </button>

          <div className="my-6 flex items-center gap-3 text-sm text-muted">
            <span className="h-px flex-1 bg-line" />
            or join with a code
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={join} className="flex gap-2">
            <label htmlFor="code" className="sr-only">
              Invite code
            </label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              onBlur={() => setTouched(code.length > 0)}
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={CODE_LENGTH + 2}
              placeholder="K7PX"
              aria-invalid={touched && !valid}
              className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 py-3 text-center font-mono text-2xl uppercase tracking-[0.4em] outline-none placeholder:text-muted/40 focus:border-accent"
            />
            <button type="submit" disabled={!valid} className="flex items-center gap-2 rounded-2xl bg-surface-2 px-5 font-semibold transition hover:bg-surface-3 disabled:opacity-40">
              <TabletIcon size={20} />
              Join
            </button>
          </form>
          {touched && code.length === CODE_LENGTH && !valid && <p className="mt-2 text-sm text-[var(--danger)]">Codes use letters and digits 2–9 (no 0, 1, O or I).</p>}
        </div>

        <p className="mt-6 text-center text-sm text-muted">Private, up to {MAX_MEMBERS} people, nothing kept after the session ends.</p>
      </div>
    </main>
  );
}
