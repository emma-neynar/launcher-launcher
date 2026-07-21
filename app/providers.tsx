'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from './lib/wagmi';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    // Dismiss the Farcaster splash screen once the app has mounted.
    // Dynamic import so the SDK is only loaded client-side.
    //
    // ready() is called unconditionally: gating it on sdk.isInMiniApp() broke
    // the web developer preview, because isInMiniApp() races the host context
    // handshake against a hard 1s timeout and returns a false negative when
    // the host responds slowly (e.g. via a tunnel). In a plain browser tab
    // ready() is a harmless postMessage to window.parent (self) that never
    // rejects, so there is no need to detect the environment first.
    import('@farcaster/miniapp-sdk')
      .then(({ sdk }) => sdk.actions.ready())
      .catch(() => {});
  }, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
