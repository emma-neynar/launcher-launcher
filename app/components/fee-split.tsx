'use client';

import { formatPct, grossFeeSplit } from '@/src/fees';
import { copy } from '../lib/copy';

/**
 * The TRUE (gross) fee split, itemized. Computed live from lpRewardBps via
 * src/fees.ts — Clanker's documented 20% protocol fee is always its own line
 * so the creator/launcher numbers are what a wallet actually receives.
 */
export function FeeSplit({ lpRewardBps }: { lpRewardBps: number }) {
  const s = grossFeeSplit(lpRewardBps);
  return (
    <div className="card" style={{ marginTop: 10 }}>
      <b style={{ fontSize: 13 }}>{copy.fees.header}</b>
      <div style={{ marginTop: 6 }}>{copy.fees.clankerLine(formatPct(s.clankerPct))}</div>
      <div>{copy.fees.creatorLine(formatPct(s.creatorPct))}</div>
      <div>{copy.fees.launcherLine(formatPct(s.launcherPct))}</div>
    </div>
  );
}

/** One-line variant for launcher cards. Still itemizes all three parties. */
export function feeSplitCompact(lpRewardBps: number): string {
  const s = grossFeeSplit(lpRewardBps);
  return copy.fees.compact(formatPct(s.clankerPct), formatPct(s.creatorPct), formatPct(s.launcherPct));
}
