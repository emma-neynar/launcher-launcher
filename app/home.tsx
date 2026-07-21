'use client';

import { useState } from 'react';
import { CreateLauncher } from './components/create-launcher';
import { LaunchToken } from './components/launch-token';
import { LauncherList } from './components/launcher-list';
import { VerifyPairing } from './components/verify-pairing';
import { WalletBar } from './components/wallet';

type Tab = 'launch' | 'create' | 'verify';

export function Home({ initialLauncher }: { initialLauncher?: `0x${string}` }) {
  const [tab, setTab] = useState<Tab>('launch');
  const [selected, setSelected] = useState<`0x${string}` | null>(initialLauncher ?? null);

  return (
    <main>
      <h1>Launcher Launcher</h1>
      <p className="subtitle">
        Launch your own token launcher on Robinhood Chain. Every token pairs with $HOODIE. No
        exceptions, no settings, no mercy.
      </p>

      <WalletBar />

      <div className="tabs">
        <button className={tab === 'launch' ? 'active' : ''} onClick={() => setTab('launch')}>
          Launch a token
        </button>
        <button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}>
          Create a launcher
        </button>
        <button className={tab === 'verify' ? 'active' : ''} onClick={() => setTab('verify')}>
          Verify
        </button>
      </div>

      {tab === 'launch' && (
        <>
          <LauncherList selected={selected} onSelect={setSelected} />
          <LaunchToken launcher={selected} />
        </>
      )}
      {tab === 'create' && (
        <CreateLauncher
          onCreated={(l) => {
            setSelected(l);
            setTab('launch');
          }}
        />
      )}
      {tab === 'verify' && <VerifyPairing />}
    </main>
  );
}
