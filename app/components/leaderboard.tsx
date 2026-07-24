'use client';

import { useQuery } from '@tanstack/react-query';
import type { LeaderboardEntry } from '@/app/api/leaderboard/route';
import type { Launch, Launcher } from '@/src/registry';
import { copy } from '../lib/copy';
import { IdentityLink } from './identity-link';
import { useLaunchers } from './launcher-list';

/**
 * The "top dawgs" leaderboard: every token launched through any launcher,
 * ranked by live market cap (Dexscreener, via /api/leaderboard — see that
 * route for why not Clanker's market data). Tokens with no market data yet
 * sit unranked at the bottom. Tapping a row opens the token detail screen.
 */
export function Leaderboard({
  onSelectToken,
  onSelectLauncher,
  onBack,
}: {
  onSelectToken: (launch: Launch, launcher: Launcher) => void;
  onSelectLauncher: (l: Launcher) => void;
  onBack: () => void;
}) {
  const { data, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard'],
    queryFn: async () => {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) throw new Error(`leaderboard fetch failed (${res.status})`);
      return res.json();
    },
    refetchInterval: 60_000,
  });
  // The registry query the whole app already runs — used to resolve the full
  // Launcher object a row belongs to for navigation.
  const { launchers } = useLaunchers();
  const entries = data ?? [];

  const select = (entry: LeaderboardEntry) => {
    const launcher = launchers.find((l) => l.id === entry.launcherId);
    if (launcher) onSelectToken(entry.launch, launcher);
  };
  const selectLauncher = (entry: LeaderboardEntry) => {
    const launcher = launchers.find((l) => l.id === entry.launcherId);
    if (launcher) onSelectLauncher(launcher);
  };

  return (
    <div>
      <button className="linkish" onClick={onBack}>
        ← back
      </button>
      <p className="meme-caption" style={{ fontSize: 16, marginTop: 10 }}>
        {copy.leaderboard.header}
      </p>
      <div className="muted" style={{ textAlign: 'center', marginBottom: 8 }}>
        {copy.leaderboard.sub}
      </div>
      {isLoading && (
        <div className="card dashed">
          <div className="muted">{copy.home.loading}</div>
        </div>
      )}
      {!isLoading && entries.length === 0 && (
        <div className="card dashed">
          <div className="muted" style={{ whiteSpace: 'pre-line' }}>
            {copy.leaderboard.empty}
          </div>
        </div>
      )}
      <div className="card-grid">
        {entries.map((entry, i) => (
          <div
            key={entry.launch.token}
            className="card clickable"
            style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}
            onClick={() => select(entry)}
          >
            <div className="rank">{entry.marketCapUsd !== null ? i + 1 : '—'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 13 }}>
                {entry.launch.name} <span className="mono">${entry.launch.symbol}</span>
              </b>
              <div style={{ marginTop: 2, fontSize: 12, fontWeight: 'bold' }}>
                {entry.marketCapUsd !== null ? (
                  copy.leaderboard.mcap(formatMarketCap(entry.marketCapUsd))
                ) : (
                  <span className="muted">{copy.leaderboard.noData}</span>
                )}
              </div>
              <div className="creator">
                {entry.launch.launcherUsername || entry.launch.launcherAddress ? (
                  <IdentityLink
                    username={entry.launch.launcherUsername}
                    pfpUrl={entry.launch.launcherPfpUrl}
                    fallbackAddress={entry.launch.launcherAddress}
                    wrap={copy.tokens.launchedBy}
                  />
                ) : (
                  <span className="muted">{copy.tokens.anon}</span>
                )}
              </div>
              <div style={{ marginTop: 4 }}>
                <button
                  className="linkish"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectLauncher(entry);
                  }}
                >
                  {copy.tokens.via(entry.launcherName)} →
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 1234567 → '$1.2m', 340000 → '$340k', 980 → '$980'. */
function formatMarketCap(usd: number): string {
  if (usd >= 1e9) return `$${trimTo3(usd / 1e9)}b`;
  if (usd >= 1e6) return `$${trimTo3(usd / 1e6)}m`;
  if (usd >= 1e3) return `$${trimTo3(usd / 1e3)}k`;
  return `$${Math.round(usd)}`;
}

/** 1.234 → '1.2', 34.56 → '34.6', 345.6 → '346' (≤3 significant-ish chars). */
function trimTo3(n: number): string {
  return n >= 100 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, '');
}
