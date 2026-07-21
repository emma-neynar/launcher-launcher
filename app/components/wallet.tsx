'use client';

import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { CHAIN_ID } from '@/src/hoodie';
import { robinhoodChain } from '../lib/wagmi';

export function WalletBar() {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  if (!isConnected) {
    return (
      <div className="card">
        <h2>Wallet</h2>
        <p className="muted">
          Connect your own wallet — you sign every transaction. This app never holds a key.
        </p>
        {connectors.map((c) => (
          <button key={c.uid} onClick={() => connect({ connector: c })} disabled={isPending} style={{ marginRight: 8 }}>
            Connect {c.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="mono">{address}</span>
        <button className="secondary" style={{ marginTop: 0 }} onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
      {chainId !== CHAIN_ID && (
        <div className="banner" style={{ marginTop: 10 }}>
          Wrong network (chain {chainId}). This app runs on Robinhood Chain ({CHAIN_ID}).
          <br />
          <button onClick={() => switchChain({ chainId: robinhoodChain.id })} disabled={switching}>
            {switching ? 'Switching…' : 'Switch / add Robinhood Chain'}
          </button>
        </div>
      )}
    </div>
  );
}
