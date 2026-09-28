import type { NextConfig } from 'next';
import { networkInterfaces } from 'node:os';

/**
 * Local development on the LAN: the tablet opens http://<this PC's IP>:3000, so the dev server must
 * accept that origin, and QR codes shown on localhost should point at the LAN address instead.
 */
function lanAddresses(): string[] {
  const rank = (ip: string) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  return Object.values(networkInterfaces())
    .flat()
    .filter((i): i is NonNullable<typeof i> => !!i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'))
    .map((i) => i.address)
    .sort((a, b) => rank(a) - rank(b));
}

const dev = process.env.NODE_ENV !== 'production';
const lan = dev ? lanAddresses() : [];
const preferred = process.env.DEV_LAN_IP ?? lan[0];

const nextConfig: NextConfig = {
  // The floating dev badge sits on top of the toolbar on phones (build errors still show).
  devIndicators: false,
  allowedDevOrigins: lan,
  env: {
    NEXT_PUBLIC_DEV_LAN_ORIGIN: dev && preferred ? `http://${preferred}:${process.env.PORT ?? 3000}` : '',
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), display-capture=(self)' },
        ],
      },
    ];
  },
};

export default nextConfig;
