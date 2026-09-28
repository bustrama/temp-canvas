/**
 * Invite codes: 4 characters from an alphabet without look-alikes (no 0/O, no 1/I).
 * 32^4 ≈ 1M codes. That is enough because a code only exists while its session is live,
 * and a session locks once two members are in.
 */
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;

const VALID = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** Uniform random code. `randomBytes` is injectable for tests. */
export function generateCode(randomBytes: (n: number) => Uint8Array = cryptoBytes): string {
  // 256 is a multiple of 32, so `byte % 32` is unbiased.
  const bytes = randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/** What the user typed -> canonical form (upper case, separators and punctuation dropped). */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, CODE_LENGTH);
}

export function isValidCode(code: string): boolean {
  return VALID.test(code);
}

function cryptoBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Random id for shapes, assets and clients. Works outside secure contexts (LAN http). */
export function randomId(length = 12): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = cryptoBytes(length);
  let out = '';
  // 252 = 7 * 36: reject the top of the byte range to stay unbiased.
  for (let i = 0; i < length; i++) {
    let b = bytes[i];
    while (b >= 252) b = cryptoBytes(1)[0];
    out += alphabet[b % 36];
  }
  return out;
}
