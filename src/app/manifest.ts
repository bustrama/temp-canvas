import type { MetadataRoute } from 'next';

/** Lets a tablet add temp canvas to its home screen, with the app icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'temp canvas',
    short_name: 'temp canvas',
    description: 'A private, temporary infinite canvas shared by up to five people. Draw on a tablet, show it on your screen.',
    start_url: '/',
    display: 'standalone',
    background_color: '#1b1a1f',
    theme_color: '#1b1a1f',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
