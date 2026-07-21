'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { CHAIN_ID } from '@/src/hoodie';
import type { Launcher } from '@/src/registry';
import { CreateLauncher } from './components/create-launcher';
import { Info } from './components/info';
import { LaunchToken } from './components/launch-token';
import { LauncherList, splitLaunchers, useLaunchers } from './components/launcher-list';
import { VerifyPairing } from './components/verify-pairing';
import { ChainGate, ConnectHero, WalletHeader } from './components/wallet';
import { copy } from './lib/copy';

type Screen = 'home' | 'mine' | 'others' | 'create' | 'launch' | 'verify' | 'info';

/**
 * The app shell as a small state machine:
 *
 *   disconnected  → ConnectHero  (screen 1)
 *   wrong chain   → ChainGate    (screen 2)
 *   connected     → home (mascot hero) / mine / others / create / launch /
 *                   verify / info
 *
 * Each screen owns its own internals (LaunchToken has its own
 * form→confirm→launching→success/error phases); this component only decides
 * which screen is on stage and carries the shared toast.
 */
export function Home({ initialLauncherId }: { initialLauncherId?: string }) {
  const { isConnected, chainId, status, address } = useAccount();
  const { launchers, isLoading } = useLaunchers();
  const [mounted, setMounted] = useState(false);
  const [screen, setScreen] = useState<Screen>('home');
  const [selected, setSelected] = useState<Launcher | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => setMounted(true), []);

  // Deep link (/l/<id>): jump straight to the launch screen once the registry
  // entry resolves.
  useEffect(() => {
    if (!initialLauncherId || selected) return;
    const l = launchers.find((x) => x.id === initialLauncherId);
    if (l) {
      setSelected(l);
      setScreen('launch');
    }
  }, [initialLauncherId, launchers, selected]);

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
  const { mine, others } = splitLaunchers(launchers, address);
  const counts = isLoading ? undefined : { mine: mine.length, others: others.length };
  const selectLauncher = (l: Launcher) => {
    setSelected(l);
    setScreen('launch');
  };

  return (
    <main>
      <WalletHeader />

      {active === 'home' && (
        <>
          <button className="btn" style={{ marginTop: 10 }} onClick={() => setScreen('create')}>
            {copy.home.button}
          </button>

          <div className="home-hero">
            <h1 className="meme-caption home-caption">{copy.home.captionTop}</h1>
            <div className="home-mascot-wrap">
              <Image
                src="/brand/yo-dawg-transparent.png"
                alt="Yo Dawg mascot"
                width={1024}
                height={746}
                className="home-mascot"
                priority
              />
              <p className="meme-caption sm home-caption-sub">{copy.home.captionBottom}</p>
            </div>
          </div>

          <div className="home-footer">
            <div className="home-footer-inner">
              <div className="home-footer-links">
                <button className="linkish light" onClick={() => setScreen('info')}>
                  {copy.home.infoLink}
                </button>
                <button className="linkish light" onClick={() => setScreen('verify')}>
                  {copy.home.verifyLink}
                </button>
              </div>
              <button
                className="btn alt round"
                style={{ marginBottom: 12 }}
                onClick={() => setScreen('mine')}
              >
                {copy.home.mineOption(counts?.mine)}
              </button>
              <button className="btn alt round" onClick={() => setScreen('others')}>
                {copy.home.othersOption(counts?.others)}
              </button>
            </div>
          </div>
        </>
      )}

      {(active === 'mine' || active === 'others') && (
        <LauncherList
          filter={active}
          onSelect={selectLauncher}
          onToast={setToast}
          onBack={() => setScreen('home')}
        />
      )}

      {active === 'create' && (
        <CreateLauncher
          onBack={() => setScreen('home')}
          onToast={setToast}
          onCreated={selectLauncher}
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

      {active === 'info' && <Info onBack={() => setScreen('home')} />}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
