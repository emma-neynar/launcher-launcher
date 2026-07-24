'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import type { Launcher } from '@/src/registry';
import { copy } from '../lib/copy';
import { APP_URL } from '../lib/wagmi';
import { feeSplitCompact } from './fee-split';

/**
 * Launchers come from the registry-only backend (app/api/launchers) — a
 * launcher is a saved config, not a contract. See README "Launcher
 * persistence" for the off-chain model.
 */
export function useLaunchers() {
  const { data, isLoading } = useQuery<Launcher[]>({
    queryKey: ['launchers'],
    queryFn: async () => {
      const res = await fetch('/api/launchers');
      if (!res.ok) throw new Error(`registry fetch failed (${res.status})`);
      return res.json();
    },
    refetchInterval: 15_000,
  });
  return { launchers: data ?? [], isLoading };
}

/** Split the registry by whether the connected wallet operates the launcher. */
export function splitLaunchers(launchers: readonly Launcher[], address?: string) {
  const mine = launchers.filter(
    (l) => address && l.feeRecipient.toLowerCase() === address.toLowerCase()
  );
  const others = launchers.filter(
    (l) => !address || l.feeRecipient.toLowerCase() !== address.toLowerCase()
  );
  return { mine, others };
}

/**
 * One list screen ('mine' or 'others') — navigated to from the mascot home.
 */
export function LauncherList({
  filter,
  onSelect,
  onToast,
  onBack,
}: {
  filter: 'mine' | 'others';
  onSelect: (l: Launcher) => void;
  onToast: (msg: string) => void;
  onBack: () => void;
}) {
  const { address } = useAccount();
  const { launchers, isLoading } = useLaunchers();
  const { mine, others } = splitLaunchers(launchers, address);
  // Busiest launchers first; stable sort keeps registry (creation) order on ties.
  const shown = (filter === 'mine' ? mine : others)
    .slice()
    .sort((a, b) => b.launches.length - a.launches.length);

  async function copyShare(id: string) {
    try {
      await navigator.clipboard.writeText(`${APP_URL}/l/${id}`);
      onToast(copy.toasts.copied);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div>
      <button className="linkish" onClick={onBack}>
        ← back
      </button>
      <p className="meme-caption" style={{ fontSize: 16, marginTop: 10 }}>
        {filter === 'mine' ? copy.home.header : copy.home.othersHeader}
      </p>
      {isLoading && (
        <div className="card dashed">
          <div className="muted">{copy.home.loading}</div>
        </div>
      )}
      {!isLoading && shown.length === 0 && (
        <div className="card dashed">
          <div className="muted" style={{ whiteSpace: 'pre-line' }}>
            {filter === 'mine' ? copy.home.mineEmpty : copy.home.empty}
          </div>
        </div>
      )}
      <div className="card-grid">
        {shown.map((l) => (
          <div key={l.id} className="card clickable" onClick={() => onSelect(l)}>
            <b style={{ fontSize: 13 }}>{l.name}</b>
            <div className="creator">
              {l.creatorUsername ? (
                <a
                  className="creator-link"
                  href={`https://farcaster.xyz/${l.creatorUsername}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  {l.creatorPfpUrl && (
                    // Plain <img>: pfpUrl is an arbitrary remote host, which
                    // next/image would reject without a remotePatterns entry.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.creatorPfpUrl} alt="" width={20} height={20} className="creator-pfp" />
                  )}
                  {copy.home.creator(`@${l.creatorUsername}`)}
                </a>
              ) : (
                <span className="muted">{copy.home.creator(shortAddress(l.feeRecipient))}</span>
              )}
            </div>
            <div className="muted">{copy.home.meta(l.launches.length)}</div>
            <div className="muted">{feeSplitCompact(l.lpRewardBps)}</div>
            <div style={{ marginTop: 8 }}>
              <span className="pill">{copy.home.pill}</span>
            </div>
            <div style={{ marginTop: 6 }}>
              <button
                className="linkish"
                onClick={(e) => {
                  e.stopPropagation();
                  copyShare(l.id);
                }}
              >
                {copy.home.share(`${APP_URL}/l/${l.id}`)}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function shortAddress(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
