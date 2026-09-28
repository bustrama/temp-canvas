import { describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));

const { originAllowed } = await import('./index');

describe('originAllowed', () => {
  it('matches exact origins and one-label wildcards', () => {
    expect(originAllowed('https://canvas.example.com', 'https://canvas.example.com')).toBe(true);
    expect(originAllowed('http://localhost:3000', 'http://localhost:*')).toBe(true);
    expect(originAllowed('https://temp-canvas-git-x.vercel.app', 'https://temp-canvas-*.vercel.app')).toBe(true);
    expect(originAllowed('https://temp-canvas-a.evil.vercel.app', 'https://temp-canvas-*.vercel.app')).toBe(false);
  });

  it('allows LAN origins only with the private keyword', () => {
    expect(originAllowed('http://10.100.102.5:3000', 'private')).toBe(true);
    expect(originAllowed('http://192.168.1.20:3000', 'private')).toBe(true);
    expect(originAllowed('http://172.20.0.3', 'private')).toBe(true);
    expect(originAllowed('http://localhost:3000', 'private')).toBe(true);
    expect(originAllowed('http://10.0.0.1.evil.com', 'private')).toBe(false);
    expect(originAllowed('http://172.40.0.3', 'private')).toBe(false);
    expect(originAllowed('http://10.100.102.5:3000', 'https://canvas.example.com')).toBe(false);
  });

  it('rejects missing origins and empty lists', () => {
    expect(originAllowed(null, 'private')).toBe(false);
    expect(originAllowed('https://evil.com', undefined)).toBe(false);
  });
});
