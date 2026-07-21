'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { CHAIN_ID } from '@/src/hoodie';
import { CreateLauncher } from './components/create-launcher';
import { LaunchToken } from './components/launch-token';
import { LauncherList } from './components/launcher-list';
import { VerifyPairing } from './components/verify-pairing';
import { ChainGate, ConnectHero, WalletHeader } from './components/wallet';
import { copy } from './lib/copy';

type Screen = 'home' | 'create' | 'launch' | 'verify';

/**
 * The app shell as a small state machine:
 *
 *   disconnected  → ConnectHero  (screen 1)
 *   wrong chain   → ChainGate    (screen 2)
 *   connected     → home / create / launch / verify
 *
 * Each screen owns its own internals (LaunchToken has its own
 * form→confirm→launching→success/error phases); this component only decides
 * which screen is on stage and carries the shared toast.
 */
export function Home({ initialLauncher }: { initialLauncher?: `0x${string}` }) {
  const { isConnected, chainId, status } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [screen, setScreen] = useState<Screen>(initialLauncher ? 'launch' : 'home');
  const [selected, setSelected] = useState<`0x${string}` | null>(initialLauncher ?? null);
  const [toast, setToast] = useState('');

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Avoid a hydration flash: wagmi always starts disconnected on the server,
  // so wait for mount (and for any auto-reconnect) before picking a screen.
  if (!mounted || status === 'reconnecting') return null;

  if (!isConnected) return <ConnectHero />;

  if (chainId !== CHAIN_ID) {
    return (
      <>
        <ChainGate onToast={setToast} />
        {toast && <div className="toast">{toast}</div>}
      </>
    );
  }

  const active: Screen = screen === 'launch' && !selected ? 'home' : screen;

  return (
    <main>
      <WalletHeader />

      {active === 'home' && (
        <>
          <LauncherList
            onSelect={(l) => {
              setSelected(l);
              setScreen('launch');
            }}
            onToast={setToast}
          />
          <button
            className="linkish"
            style={{ display: 'block', margin: '14px auto 0' }}
            onClick={() => setScreen('verify')}
          >
            {copy.home.verifyLink}
          </button>
          <button className="btn bottom" onClick={() => setScreen('create')}>
            {copy.home.button}
          </button>
        </>
      )}

      {active === 'create' && (
        <CreateLauncher
          onBack={() => setScreen('home')}
          onToast={setToast}
          onCreated={(l) => {
            setSelected(l);
            setScreen('launch');
          }}
        />
      )}

      {active === 'launch' && selected && (
        <LaunchToken
          launcher={selected}
          onBack={() => setScreen('home')}
          onToast={setToast}
          onDone={() => setScreen('home')}
        />
      )}

      {active === 'verify' && <VerifyPairing onBack={() => setScreen('home')} />}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
