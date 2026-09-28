import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, generateCode, isValidCode, normalizeCode, randomId } from './code';

describe('invite codes', () => {
  it('generates valid 4-character codes without look-alikes', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateCode();
      expect(isValidCode(code)).toBe(true);
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  it('maps bytes onto the alphabet uniformly', () => {
    expect(generateCode(() => new Uint8Array([0, 31, 32, 255]))).toBe(`${CODE_ALPHABET[0]}${CODE_ALPHABET[31]}${CODE_ALPHABET[0]}${CODE_ALPHABET[31]}`);
  });

  it('normalizes what people type', () => {
    expect(normalizeCode(' k7-px ')).toBe('K7PX');
    expect(normalizeCode('abcdef')).toBe('ABCD');
  });

  it('rejects codes with look-alike or foreign characters', () => {
    expect(isValidCode('K7PX')).toBe(true);
    expect(isValidCode('K0PX')).toBe(false);
    expect(isValidCode('KIPX')).toBe(false);
    expect(isValidCode('K7P')).toBe(false);
    expect(isValidCode('k7px')).toBe(false);
  });

  it('makes random ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => randomId()));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(/^[0-9a-z]{12}$/);
  });
});
