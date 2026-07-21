'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { CHAIN_ID } from '@/src/hoodie';
import { copy } from '../lib/copy';
import { APP_URL, robinhoodChain } from '../lib/wagmi';

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
export function useFarcasterChainSupport(connectorId: string | undefined) {
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

/**
 * Surface detection: null until resolved. Used to hide the Farcaster
 * connector in a plain browser, where it is a dead end.
 *
 * We deliberately do NOT use sdk.isInMiniApp(): it races the host context
 * handshake against a hard 1s timeout, which yields false negatives when the
 * host responds slowly (e.g. the web dev preview over a Cloudflare tunnel).
 * Instead: a plain top-level browser tab is detected synchronously (instant
 * false), and anything that might be a host (iframe / RN WebView) waits on
 * sdk.context with a generous 10s timeout before giving up.
 */
function useIsInMiniApp() {
  const [inMiniApp, setInMiniApp] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Not an iframe and not a React Native WebView: definitely the open web.
    if (
      window === window.parent &&
      !(window as { ReactNativeWebView?: unknown }).ReactNativeWebView
    ) {
      setInMiniApp(false);
      return;
    }
    import('@farcaster/miniapp-sdk')
      .then(async ({ sdk }) => {
        const result = await Promise.race([
          sdk.context.then((ctx) => Boolean(ctx)),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10_000)),
        ]);
        if (!cancelled) setInMiniApp(result);
      })
      .catch(() => {
        if (!cancelled) setInMiniApp(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return inMiniApp;
}

/** Screen 1 — full-bleed hero with the canonical caption and connect buttons. */
export function ConnectHero() {
  const { connect, connectors, isPending } = useConnect();
  const inMiniApp = useIsInMiniApp();
  // Hide nothing until detection resolves; only filter once we know we're on
  // the open web (inMiniApp === false), where the Farcaster connector can't
  // connect to anything.
  const visible = connectors.filter((c) => c.id !== 'farcaster' || inMiniApp !== false);

  return (
    <div className="hero">
      <div className="hero-content">
        <h1 className="meme-caption" style={{ fontSize: 22 }}>
          {copy.connect.captionTop}
        </h1>
        <div style={{ flex: 1 }} />
        <p className="meme-caption" style={{ fontSize: 15, marginBottom: 12 }}>
          {copy.connect.captionBottom}
        </p>
        {visible.map((c) => (
          <button
            key={c.uid}
            className="btn"
            style={{ marginBottom: 8 }}
            onClick={() => connect({ connector: c })}
            disabled={isPending}
          >
            {isPending
              ? copy.connect.connecting
              : visible.length > 1
                ? `connect w/ ${c.name.toLowerCase()} →`
                : copy.connect.button}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Screen 2 — the add-chain fallback. Only rendered when the connected wallet
 * is on the wrong chain. Runtime-detects the Farcaster host wallet, which
 * genuinely cannot reach 4663, and switches to the honest "open in browser"
 * variant instead of dead-ending on a broken switch prompt.
 */
export function ChainGate({ onToast }: { onToast: (msg: string) => void }) {
  const { connector } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending, error } = useSwitchChain();
  const farcasterSupports4663 = useFarcasterChainSupport(connector?.id);
  const blocked = connector?.id === 'farcaster' && farcasterSupports4663 === false;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(APP_URL);
      onToast(copy.toasts.copied);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <main>
      <div className="logo">
        <b>YO DAWG</b>
      </div>
      <div className="center">
        <Image
          src="/brand/yo-dawg-transparent.png"
          alt="Yo Dawg mascot"
          width={160}
          height={160}
          className="mascot"
        />
        <h1 className="meme-caption" style={{ fontSize: 22 }}>
          {copy.addChain.title}
        </h1>
        <p className="meme-sub">{blocked ? copy.addChain.blockedBody : copy.addChain.body}</p>
        {!blocked && error && (
          <p className="error-code">chain switch failed: {error.message.split('\n')[0]}</p>
        )}
      </div>
      {blocked ? (
        <button className="btn neon bottom" onClick={copyLink}>
          {copy.addChain.blockedButton}
        </button>
      ) : (
        <button
          className="btn neon bottom"
          onClick={() =>
            switchChain(
              { chainId: robinhoodChain.id },
              { onSuccess: () => onToast(copy.toasts.chainSwitched) }
            )
          }
          disabled={isPending}
        >
          {isPending ? 'adding…' : copy.addChain.button}
        </button>
      )}
      <button className="linkish" style={{ margin: '10px auto 0' }} onClick={() => disconnect()}>
        use a different wallet
      </button>
    </main>
  );
}

/** Slim connected header: logo left, address chip + disconnect right. */
export function WalletHeader() {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();

  return (
    <div className="logo" style={{ justifyContent: 'space-between' }}>
      <b>YO DAWG</b>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          className="mono"
          style={{ background: 'rgba(255,255,255,.8)', borderRadius: 6, padding: '2px 6px' }}
        >
          {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''}
        </span>
        <button className="linkish" onClick={() => disconnect()}>
          disconnect
        </button>
      </span>
    </div>
  );
}
