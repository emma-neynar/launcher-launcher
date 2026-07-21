'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from './lib/wagmi';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    // Dismiss the Farcaster splash screen once the app has mounted.
    // Dynamic import so the SDK is only loaded client-side. In a plain
    // browser (no Farcaster host) sdk.isInMiniApp() resolves false within
    // ~1s and we skip ready() entirely; the trailing catch keeps any host
    // communication failure from surfacing.
    import('@farcaster/miniapp-sdk')
      .then(async ({ sdk }) => {
        if (await sdk.isInMiniApp()) await sdk.actions.ready();
      })
      .catch(() => {});
  }, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
