import Link from 'next/link';
import { isValidCode, normalizeCode } from '@/shared/code';
import { Room } from '@/ui/Room';

export default async function SessionPage({ params }: PageProps<'/s/[code]'>) {
  const { code: raw } = await params;
  const code = normalizeCode(decodeURIComponent(raw));
  if (!isValidCode(code)) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-semibold">That is not a valid code</h1>
        <p className="text-muted">Invite codes are 4 characters, like K7PX.</p>
        <Link href="/" className="rounded-2xl bg-accent px-5 py-3 font-semibold text-white">
          Back to start
        </Link>
      </main>
    );
  }
  return <Room code={code} />;
}
