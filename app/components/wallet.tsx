'use client';

import { useEffect, useState } from 'react';
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { CHAIN_ID } from '@/src/hoodie';
import { robinhoodChain } from '../lib/wagmi';

/**
 * KNOWN LIMITATION (verified against @farcaster/miniapp-wagmi-connector source
 * and farcasterxyz/miniapps#240): the Farcaster host wallet supports
 * wallet_switchEthereumChain but NOT wallet_addEthereumChain, and its built-in
 * chain list (Base, Mainnet, OP, Arbitrum, Polygon, Unichain, Zora, …) does
 * not include Robinhood Chain (4663). So inside a Farcaster client the
 * embedded wallet cannot reach this chain at all. Injected wallets (MetaMask,
 * Rabby, …) work: wagmi falls back to wallet_addEthereumChain automatically.
 * We detect the actual host support at runtime via sdk.getChains().
 */
function useFarcasterChainSupport(connectorId: string | undefined) {
  // null = unknown/not applicable, false = host wallet cannot do 4663.
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    if (connectorId !== 'farcaster') {
      setSupported(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { sdk } = await import('@farcaster/miniapp-sdk');
        const chains = await sdk.getChains(); // CAIP-2 ids, e.g. "eip155:8453"
        if (!cancelled) setSupported(chains.includes(`eip155:${CHAIN_ID}`));
      } catch {
        // Old host without getChains: assume unsupported (Robinhood is not in
        // any known host's chain list today).
        if (!cancelled) setSupported(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectorId]);

  return supported;
}

export function WalletBar() {
  const { isConnected, address, connector } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching, error: switchError } = useSwitchChain();
  const farcasterSupports4663 = useFarcasterChainSupport(connector?.id);
  const [inMiniApp, setInMiniApp] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { sdk } = await import('@farcaster/miniapp-sdk');
        setInMiniApp(await sdk.isInMiniApp());
      } catch {
        /* not in a mini app host */
      }
    })();
  }, []);

  if (!isConnected) {
    return (
      <div className="card">
        <h2>Wallet</h2>
        <p className="muted">
          Connect your own wallet — you sign every transaction. This app never holds a key.
        </p>
        {inMiniApp && (
          <p className="warn">
            Heads up: the Farcaster in-app wallet cannot use Robinhood Chain (it cannot add custom
            chains). To launch tokens, open this app in your browser and connect an external wallet
            (MetaMask, Rabby, WalletConnect, …).
          </p>
        )}
        {connectors.map((c) => (
          <button key={c.uid} onClick={() => connect({ connector: c })} disabled={isPending} style={{ marginRight: 8 }}>
            Connect {c.name}
          </button>
        ))}
      </div>
    );
  }

  const wrongChain = chainId !== CHAIN_ID;
  const farcasterBlocked = connector?.id === 'farcaster' && farcasterSupports4663 === false;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="mono">{address}</span>
        <button className="secondary" style={{ marginTop: 0 }} onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
      {wrongChain && farcasterBlocked && (
        <div className="banner" style={{ marginTop: 10 }}>
          <strong>Known limitation:</strong> the Farcaster in-app wallet does not support Robinhood
          Chain ({CHAIN_ID}) — it cannot add custom chains (no <span className="mono">wallet_addEthereumChain</span>),
          and Robinhood is not in its built-in chain list. Open this app in a regular browser with an
          injected wallet (MetaMask, Rabby, …) to launch tokens.
        </div>
      )}
      {wrongChain && !farcasterBlocked && (
        <div className="banner" style={{ marginTop: 10 }}>
          Wrong network (chain {chainId}). This app runs on Robinhood Chain ({CHAIN_ID}).
          <br />
          <button onClick={() => switchChain({ chainId: robinhoodChain.id })} disabled={switching}>
            {switching ? 'Switching…' : 'Switch / add Robinhood Chain'}
          </button>
          {switchError && (
            <p className="error">
              Chain switch failed: {switchError.message.split('\n')[0]}. If your wallet cannot add
              chains, add Robinhood Chain manually (id {CHAIN_ID}, RPC
              rpc.mainnet.chain.robinhood.com).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
