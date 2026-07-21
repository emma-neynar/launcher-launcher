'use client';

import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { launcherAbi, launcherLauncherAbi } from '@/src/wrapper-abi';
import { copy } from '../lib/copy';
import { APP_URL, LAUNCHER_LAUNCHER_ADDRESS } from '../lib/wagmi';

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
  onSelect,
  onToast,
}: {
  onSelect: (l: `0x${string}`) => void;
  onToast: (msg: string) => void;
}) {
  const { address } = useAccount();
  const { launchers, isLoading } = useLaunchers();

  const { data: counts } = useReadContracts({
    contracts: launchers.map((l) => ({
      address: l.launcher,
      abi: launcherAbi,
      functionName: 'launchCount' as const,
    })),
    query: { enabled: launchers.length > 0, refetchInterval: 15_000 },
  });

  const countFor = (i: number) => {
    const r = counts?.[i];
    return r && r.status === 'success' ? Number(r.result as bigint) : 0;
  };

  const mine = launchers
    .map((l, i) => ({ ...l, count: countFor(i) }))
    .filter((l) => address && l.creator.toLowerCase() === address.toLowerCase());
  const others = launchers
    .map((l, i) => ({ ...l, count: countFor(i) }))
    .filter((l) => !address || l.creator.toLowerCase() !== address.toLowerCase());

  async function copyShare(launcher: `0x${string}`) {
    try {
      await navigator.clipboard.writeText(`${APP_URL}/l/${launcher}`);
      onToast(copy.toasts.copied);
    } catch {
      /* clipboard unavailable */
    }
  }

  function card(l: LauncherInfo & { count: number }, ownedByMe: boolean) {
    return (
      <div key={l.launcher} className="card clickable" onClick={() => onSelect(l.launcher)}>
        <b style={{ fontSize: 13 }}>{l.name || short(l.launcher)}</b>
        <div className="muted">
          {ownedByMe
            ? copy.home.meta(l.count, String(l.lpRewardBps / 100))
            : copy.home.othersMeta(l.count, String(l.lpRewardBps / 100))}
        </div>
        <div className="pill" style={{ marginTop: 8 }}>
          {copy.home.pill}
        </div>
        <div style={{ marginTop: 6 }}>
          <button
            className="linkish"
            onClick={(e) => {
              e.stopPropagation();
              copyShare(l.launcher);
            }}
          >
            {copy.home.share(`${APP_URL}/l/${short(l.launcher)}`)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="meme-caption sm" style={{ fontSize: 16, marginTop: 10 }}>
        {copy.home.header}
      </p>
      {isLoading && (
        <div className="card dashed">
          <div className="muted">{copy.home.loading}</div>
        </div>
      )}
      {!isLoading && mine.length === 0 && (
        <div className="card dashed">
          <div className="muted">{copy.home.mineEmpty}</div>
        </div>
      )}
      {mine.map((l) => card(l, true))}

      <p className="meme-caption sm" style={{ fontSize: 16, marginTop: 14 }}>
        {copy.home.othersHeader}
      </p>
      {!isLoading && others.length === 0 && (
        <div className="card dashed">
          <div className="muted" style={{ whiteSpace: 'pre-line' }}>
            {copy.home.empty}
          </div>
        </div>
      )}
      {others.map((l) => card(l, false))}
    </div>
  );
}

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
