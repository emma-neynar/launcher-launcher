'use client';

import { useReadContract } from 'wagmi';
import { launcherLauncherAbi } from '@/src/wrapper-abi';
import { LAUNCHER_LAUNCHER_ADDRESS, APP_URL } from '../lib/wagmi';

export type LauncherInfo = {
  launcher: `0x${string}`;
  creator: `0x${string}`;
  name: string;
  feeRecipient: `0x${string}`;
  lpRewardBps: number;
  createdAt: bigint;
};

export function useLaunchers() {
  const { data, refetch, isLoading } = useReadContract({
    address: LAUNCHER_LAUNCHER_ADDRESS || undefined,
    abi: launcherLauncherAbi,
    functionName: 'allLaunchers',
    query: { enabled: Boolean(LAUNCHER_LAUNCHER_ADDRESS), refetchInterval: 15_000 },
  });
  return { launchers: (data ?? []) as readonly LauncherInfo[], refetch, isLoading };
}

export function LauncherList({
  selected,
  onSelect,
}: {
  selected: `0x${string}` | null;
  onSelect: (l: `0x${string}`) => void;
}) {
  const { launchers, isLoading } = useLaunchers();

  return (
    <div className="card">
      <h2>Launchers</h2>
      <p className="muted">
        On-chain registry ({launchers.length}). Every launcher pairs its tokens with $HOODIE — that
        rule ships in the shared implementation bytecode.
      </p>
      {isLoading && <p className="muted">Loading registry…</p>}
      {!isLoading && launchers.length === 0 && <p className="muted">No launchers yet. Create the first one.</p>}
      {launchers.map((l) => (
        <div
          key={l.launcher}
          className={`launcher-item${selected === l.launcher ? ' selected' : ''}`}
          onClick={() => onSelect(l.launcher)}
        >
          <div className="name">{l.name}</div>
          <div className="mono muted">{l.launcher}</div>
          <div className="muted">
            launcher fee share {l.lpRewardBps / 100}% · created by {short(l.creator)}
          </div>
          <div className="muted mono">share: {`${APP_URL}/l/${l.launcher}`}</div>
        </div>
      ))}
    </div>
  );
}

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
