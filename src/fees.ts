/**
 * Fee constants and the ONE place gross fee splits are computed.
 *
 * Dependency-free on purpose: imported by the CLI, the Next.js API routes,
 * and the mini app UI so every surface advertises the same numbers.
 *
 * The split users actually experience (gross, of ALL LP fees a pool earns):
 *
 *   Clanker protocol   20%                                (fixed, documented)
 *   token creator      80% x (1 - lpRewardBps/10000)
 *   launcher operator  80% x (lpRewardBps/10000)
 *
 * The 80/20 creator/launcher numbers configured in `rewards.recipients` are
 * shares of the POST-protocol reward pool. Never present those as what a
 * user earns — always itemize Clanker's 20% so nothing is hidden.
 */

/**
 * Clanker documented protocol fee: the protocol keeps 20% of all LP fees
 * before reward recipients see anything. Single labeled constant so a
 * protocol-side change is a one-line update.
 * Source: https://clanker.world/docs (fee documentation).
 */
export const CLANKER_PROTOCOL_FEE_BPS = 2000;

/**
 * TODO(dev answer pending): exact pool fee bps we deploy with. This is the
 * static LP fee charged on each swap (per side), NOT the reward split — it
 * changes absolute fee revenue, never the percentage split below.
 * Shipping with 1% (100 bps) each side until confirmed.
 */
export const POOL_FEE_BPS = 100;

/** The one user-set launcher parameter: operator's cut of the reward pool. */
export const DEFAULT_LP_REWARD_BPS = 2000;
export const MIN_LP_REWARD_BPS = 0;
export const MAX_LP_REWARD_BPS = 8000;

export function isValidLpRewardBps(bps: number): boolean {
  return Number.isInteger(bps) && bps >= MIN_LP_REWARD_BPS && bps <= MAX_LP_REWARD_BPS;
}

export function clampLpRewardBps(bps: number): number {
  if (!Number.isFinite(bps)) return DEFAULT_LP_REWARD_BPS;
  return Math.min(MAX_LP_REWARD_BPS, Math.max(MIN_LP_REWARD_BPS, Math.round(bps)));
}

export type GrossFeeSplit = {
  /** Always CLANKER_PROTOCOL_FEE_BPS / 100 — shown as an explicit line item. */
  clankerPct: number;
  creatorPct: number;
  launcherPct: number;
};

/** Wallet-accurate gross percentages, computed live from lpRewardBps. */
export function grossFeeSplit(lpRewardBps: number): GrossFeeSplit {
  const rewardPoolBps = 10_000 - CLANKER_PROTOCOL_FEE_BPS; // 8000 = the 80%
  return {
    clankerPct: CLANKER_PROTOCOL_FEE_BPS / 100,
    creatorPct: (rewardPoolBps * (10_000 - lpRewardBps)) / 10_000 / 100,
    launcherPct: (rewardPoolBps * lpRewardBps) / 10_000 / 100,
  };
}

/** "16", "6.4", "0.08" — percentages without trailing zero noise. */
export function formatPct(pct: number): string {
  return String(Number(pct.toFixed(2)));
}
