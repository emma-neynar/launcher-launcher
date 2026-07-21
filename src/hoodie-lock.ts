import type { ClankerTokenV4 } from 'clanker-sdk';
import { isAddressEqual } from 'viem';
import { CHAIN_ID, HOODIE_ADDRESS } from './constants';
import { POOL_FEE_BPS, isValidLpRewardBps } from './fees';
import type { Launcher } from './registry';
import { CANONICAL_OPENING_TICK, POSITION_WIDTH } from './tick';

export class HoodiePairingViolation extends Error {
  constructor(offered: string) {
    super(
      `Paired token is locked to $HOODIE (${HOODIE_ADDRESS}) and cannot be overridden. ` +
        `Rejected attempt to pair with ${offered}.`
    );
    this.name = 'HoodiePairingViolation';
  }
}

export type LaunchRequest = {
  name: string;
  symbol: string;
  image?: string;
  description?: string;
  /** Token creator: becomes tokenAdmin and majority reward recipient. */
  creator: `0x${string}`;
  /**
   * Starting tick. Defaults to CANONICAL_OPENING_TICK (src/tick.ts) — the
   * single whitelistable opening tick for $HOODIE pairs. Only the CLI's
   * advanced --tick flag ever overrides this.
   */
  startingTick?: number;
  /**
   * Present only so hostile input has somewhere to land. Anything other than
   * $HOODIE (or omission) throws HoodiePairingViolation.
   */
  requestedPairedToken?: string;
};

/**
 * Build a ClankerTokenV4 config with the paired token hardcoded to $HOODIE.
 * This is the ONLY place in the repo that constructs a deploy config, and
 * `pool.pairedToken` is written from the frozen constant, never from input.
 */
export function buildLockedTokenConfig(launcher: Launcher, req: LaunchRequest): ClankerTokenV4 {
  if (
    req.requestedPairedToken !== undefined &&
    !isAddressEqual(req.requestedPairedToken as `0x${string}`, HOODIE_ADDRESS)
  ) {
    throw new HoodiePairingViolation(req.requestedPairedToken);
  }
  if (!isValidLpRewardBps(launcher.lpRewardBps)) {
    throw new Error(`Launcher "${launcher.id}" has an invalid lpRewardBps (${launcher.lpRewardBps})`);
  }

  const creatorBps = 10_000 - launcher.lpRewardBps;
  const tick = req.startingTick ?? CANONICAL_OPENING_TICK;

  return {
    name: req.name,
    symbol: req.symbol,
    image: req.image ?? '',
    chainId: CHAIN_ID,
    tokenAdmin: req.creator,
    metadata: req.description ? { description: req.description } : undefined,
    context: {
      interface: `Launcher Launcher: ${launcher.name}`,
      platform: 'launcher-launcher',
      id: launcher.id,
    },
    pool: {
      pairedToken: HOODIE_ADDRESS, // THE RULE — not a parameter.
      // The SDK's default tick (-230400) assumes a WETH pair; for $HOODIE it
      // means ~10 HOODIE market cap. Use the canonical tick instead, with one
      // position starting exactly at it (SDK/factory requirement).
      tickIfToken0IsClanker: tick,
      positions: [
        {
          tickLower: tick,
          tickUpper: tick + POSITION_WIDTH,
          positionBps: 10_000,
        },
      ],
    },
    fees: { type: 'static', clankerFee: POOL_FEE_BPS, pairedFee: POOL_FEE_BPS },
    rewards: {
      recipients: [
        { admin: req.creator, recipient: req.creator, bps: creatorBps, token: 'Both' },
        {
          admin: launcher.feeRecipient,
          recipient: launcher.feeRecipient,
          bps: launcher.lpRewardBps,
          token: 'Both',
        },
      ],
    },
    vanity: false,
  };
}

/**
 * Defense in depth: after the SDK converts the config into raw
 * `deployToken(...)` calldata args, re-verify that the encoded
 * poolConfig.pairedToken is exactly $HOODIE before anything is
 * simulated or sent. Throws if the encoded transaction disagrees.
 */
export function assertHoodieInCalldata(deploymentConfig: {
  poolConfig: { pairedToken: `0x${string}` };
}): void {
  const encoded = deploymentConfig.poolConfig.pairedToken;
  if (!isAddressEqual(encoded, HOODIE_ADDRESS)) {
    throw new HoodiePairingViolation(encoded);
  }
}
