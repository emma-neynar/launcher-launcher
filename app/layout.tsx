import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/** fc:miniapp embed — makes this URL launchable as a Mini App from a cast. */
const miniAppEmbed = {
  version: '1',
  imageUrl: `${APP_URL}/embed-image.png`,
  button: {
    title: 'Launch with $HOODIE',
    action: {
      type: 'launch_miniapp',
      name: 'Launcher Launcher',
      url: APP_URL,
    },
  },
};

export const metadata: Metadata = {
  title: 'Launcher Launcher',
  description: 'Launch token launchers on Robinhood Chain. Every token pairs with $HOODIE. No exceptions.',
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
