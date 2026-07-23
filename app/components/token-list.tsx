'use client';

import { EXPLORER_URL } from '@/src/hoodie';
import type { Launch, Launcher } from '@/src/registry';
import { copy } from '../lib/copy';
import { useLaunchers } from './launcher-list';

/**
 * The cross-launcher "tokens launched" screen: every launch from every
 * registered launcher, newest first. Registry-only display data — the
 * on-chain truth for any row is one click away on the explorer.
 */
export function TokenList({
  onSelectToken,
  onSelectLauncher,
  onBack,
}: {
  onSelectToken: (launch: Launch, launcher: Launcher) => void;
  onSelectLauncher: (l: Launcher) => void;
  onBack: () => void;
}) {
  const { launchers, isLoading } = useLaunchers();
  const rows = flattenLaunches(launchers);

  return (
    <div>
      <button className="linkish" onClick={onBack}>
        ← back
      </button>
      <p className="meme-caption" style={{ fontSize: 16, marginTop: 10 }}>
        {copy.tokens.header}
      </p>
      {isLoading && (
        <div className="card dashed">
          <div className="muted">{copy.home.loading}</div>
        </div>
      )}
      {!isLoading && rows.length === 0 && (
        <div className="card dashed">
          <div className="muted" style={{ whiteSpace: 'pre-line' }}>
            {copy.tokens.empty}
          </div>
        </div>
      )}
      <div className="card-grid">
        {rows.map(({ launch, launcher }) => (
          <div
            key={launch.token}
            className="card clickable"
            onClick={() => onSelectToken(launch, launcher)}
          >
            <b style={{ fontSize: 13 }}>
              {launch.name} <span className="mono">${launch.symbol}</span>
            </b>
            <div style={{ marginTop: 2 }}>
              <a
                className="mono"
                style={{ fontSize: 12 }}
                href={`${EXPLORER_URL}/token/${launch.token}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                {shortAddress(launch.token)}
              </a>
            </div>
            <div className="creator">
              {launch.launcherUsername ? (
                <a
                  className="creator-link"
                  href={`https://farcaster.xyz/${launch.launcherUsername}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  {launch.launcherPfpUrl && (
                    // Plain <img>: pfpUrl is an arbitrary remote host, which
                    // next/image would reject without a remotePatterns entry.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={launch.launcherPfpUrl}
                      alt=""
                      width={20}
                      height={20}
                      className="creator-pfp"
                    />
                  )}
                  {copy.tokens.launchedBy(`@${launch.launcherUsername}`)}
                </a>
              ) : launch.launcherAddress ? (
                <span className="muted">
                  {copy.tokens.launchedBy(shortAddress(launch.launcherAddress))}
                </span>
              ) : (
                <span className="muted">{copy.tokens.anon}</span>
              )}
            </div>
            <div style={{ marginTop: 4 }}>
              <button
                className="linkish"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectLauncher(launcher);
                }}
              >
                {copy.tokens.via(launcher.name)} →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Every launch across every launcher, newest first. */
function flattenLaunches(
  launchers: readonly Launcher[]
): { launch: Launch; launcher: Launcher }[] {
  return launchers
    .flatMap((launcher) => launcher.launches.map((launch) => ({ launch, launcher })))
    .sort((a, b) => b.launch.at.localeCompare(a.launch.at));
}

function shortAddress(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
