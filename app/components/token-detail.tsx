'use client';

import { EXPLORER_URL } from '@/src/constants';
import type { Launch, Launcher } from '@/src/registry';
import { copy } from '../lib/copy';
import { APP_URL } from '../lib/wagmi';
import { IdentityLink } from './identity-link';

/**
 * The token detail screen — opened by tapping a card on "tokens launched".
 * Registry-only display data, styled like the launch success card; the
 * on-chain truth is one tap away on the explorer.
 */
export function TokenDetail({
  launch,
  launcher,
  onSelectLauncher,
  onBack,
  onToast,
}: {
  launch: Launch;
  launcher: Launcher;
  onSelectLauncher: (l: Launcher) => void;
  onBack: () => void;
  onToast: (msg: string) => void;
}) {
  async function share() {
    const url = `${APP_URL}/l/${launcher.id}`;
    const text = copy.token.shareCast(`$${launch.symbol}`, url);
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      await sdk.actions.composeCast({ text, embeds: [url] });
    } catch {
      // Outside a Farcaster host: fall back to the clipboard.
      try {
        await navigator.clipboard.writeText(text);
        onToast(copy.toasts.copied);
      } catch {
        /* clipboard unavailable */
      }
    }
  }

  return (
    <>
      <button className="linkish" onClick={onBack}>
        ← back
      </button>

      <h1 className="meme-caption" style={{ fontSize: 20, marginTop: 10 }}>
        {launch.name} <span style={{ whiteSpace: 'nowrap' }}>${launch.symbol}</span>
      </h1>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="muted">{copy.success.tokenLabel}</div>
        <b style={{ fontSize: 13 }} className="mono">
          <a href={`${EXPLORER_URL}/token/${launch.token}`} target="_blank" rel="noreferrer">
            {shortAddress(launch.token)}
          </a>
        </b>

        <div className="muted" style={{ marginTop: 6 }}>
          {copy.success.launchedByLabel}
        </div>
        <b style={{ fontSize: 13 }}>
          {launch.launcherUsername || launch.launcherAddress ? (
            <IdentityLink
              username={launch.launcherUsername}
              pfpUrl={launch.launcherPfpUrl}
              fallbackAddress={launch.launcherAddress}
            />
          ) : (
            <span className="muted">{copy.tokens.anon}</span>
          )}
        </b>

        <div className="muted" style={{ marginTop: 6 }}>
          {copy.success.viaLabel}
        </div>
        <b style={{ fontSize: 13 }}>
          <button className="linkish" onClick={() => onSelectLauncher(launcher)}>
            “{launcher.name}” →
          </button>{' '}
          <IdentityLink
            username={launcher.creatorUsername}
            pfpUrl={launcher.creatorPfpUrl}
            fallbackAddress={launcher.feeRecipient}
            wrap={copy.home.creator}
          />
        </b>

        <div className="muted" style={{ marginTop: 6 }}>
          {copy.success.pairedLabel}
        </div>
        <b style={{ fontSize: 13 }}>{copy.token.pairedValue}</b>

        <div className="muted" style={{ marginTop: 6 }}>
          {copy.token.dateLabel}
        </div>
        <b style={{ fontSize: 13 }}>{formatLaunchDate(launch.at)}</b>

        {launch.txHash && (
          <div style={{ marginTop: 8 }}>
            <a
              className="mono"
              href={`${EXPLORER_URL}/tx/${launch.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {copy.token.viewTx}
            </a>
          </div>
        )}
      </div>

      <button className="btn neon" style={{ marginTop: 14 }} onClick={() => onSelectLauncher(launcher)}>
        {copy.token.launchButton}
      </button>
      <button className="linkish" style={{ margin: '10px auto 0' }} onClick={share}>
        {copy.token.shareButton}
      </button>
    </>
  );
}

/** ISO timestamp → 'jul 22, 2026' (lowercase, brand voice). */
function formatLaunchDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .toLowerCase();
}

function shortAddress(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
