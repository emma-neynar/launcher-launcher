/**
 * The signed-message scheme that authenticates launcher creation (security
 * finding A-01). Dependency-free and shared verbatim by the client
 * (app/components/create-launcher.tsx, wagmi useSignMessage) and the server
 * (app/api/launchers/route.ts, viem verifyMessage) so the two sides can never
 * drift: the server rebuilds the exact message from the POSTed fields and
 * requires the recovered signer to be the feeRecipient itself.
 *
 * Plain personal_sign text (not typed data) on purpose — it is the one
 * signing method every wallet in play supports, including the Farcaster
 * embedded wallet.
 */

/** Reject signatures whose issuedAt is older than this (replay window). */
export const MAX_SIGNATURE_AGE_MS = 10 * 60 * 1000;
/** Small allowance for client/server clock skew on "future" timestamps. */
export const MAX_SIGNATURE_FUTURE_SKEW_MS = 2 * 60 * 1000;

export type CreateLauncherMessageFields = {
  name: string;
  feeRecipient: string;
  lpRewardBps: number;
  /** ISO-8601 timestamp minted by the client right before signing. */
  issuedAt: string;
};

/**
 * The exact text the fee recipient signs. Human-readable in the wallet
 * prompt; every launcher parameter is bound into it, plus a timestamp so a
 * captured signature can't be replayed later.
 */
export function createLauncherMessage(f: CreateLauncherMessageFields): string {
  return [
    'launcher launcher: create a launcher',
    '',
    `name: ${f.name}`,
    `fee recipient: ${f.feeRecipient.toLowerCase()}`,
    `lp reward bps: ${f.lpRewardBps}`,
    `issued at: ${f.issuedAt}`,
    '',
    'signing proves you control the fee recipient wallet. this costs nothing and sends no transaction.',
  ].join('\n');
}

/** True when issuedAt parses and sits inside the accepted freshness window. */
export function isFreshIssuedAt(issuedAt: string, now: number = Date.now()): boolean {
  const t = Date.parse(issuedAt);
  if (Number.isNaN(t)) return false;
  return t >= now - MAX_SIGNATURE_AGE_MS && t <= now + MAX_SIGNATURE_FUTURE_SKEW_MS;
}
