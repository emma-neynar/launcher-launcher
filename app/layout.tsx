import type { Metadata } from 'next';
// Self-hosted brand fonts: Anton = Impact fallback, Comic Neue = Comic Sans
// fallback (see --font-impact / --font-comic in globals.css).
import '@fontsource/anton/400.css';
import '@fontsource/comic-neue/400.css';
import '@fontsource/comic-neue/700.css';
import './globals.css';
import { Providers } from './providers';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/** fc:miniapp embed — makes this URL launchable as a Mini App from a cast. */
const miniAppEmbed = {
  version: '1',
  imageUrl: `${APP_URL}/embed-image.png`,
  button: {
    title: 'launch a launcher, dawg',
    action: {
      type: 'launch_miniapp',
      name: 'YO DAWG',
      url: APP_URL,
      splashImageUrl: `${APP_URL}/splash.png`,
      splashBackgroundColor: '#8A63D2',
    },
  },
};

export const metadata: Metadata = {
  title: 'YO DAWG — launcher launcher',
  description:
    'yo dawg, i heard you like launchers. put a launcher launcher in your launcher on Robinhood Chain — every token pairs with $HOODIE. house rule. only rule.',
  other: {
    'fc:miniapp': JSON.stringify(miniAppEmbed),
    // Backward compatibility for older Farcaster clients.
    'fc:frame': JSON.stringify({
      ...miniAppEmbed,
      button: { ...miniAppEmbed.button, action: { ...miniAppEmbed.button.action, type: 'launch_frame' } },
    }),
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
