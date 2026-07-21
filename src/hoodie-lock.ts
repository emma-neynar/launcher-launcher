import type { ClankerTokenV4 } from 'clanker-sdk';
import { isAddressEqual } from 'viem';
import { CHAIN_ID, HOODIE_ADDRESS } from './constants.js';
import type { Launcher } from './registry.js';
import { DEFAULT_TICK } from './tick.js';

/** Width of the single LP position (matches Launcher.sol POSITION_WIDTH). */
const POSITION_WIDTH = 110400;

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
   * Starting tick computed from a target market cap (see src/tick.ts). If
   * omitted, falls back to DEFAULT_TICK (≈$30k calibrated 2026-07-20 — the
   * caller should really pass a tick computed from the live $HOODIE price).
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

  const creatorBps = 10_000 - launcher.feeShareBps;

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
      // means ~10 HOODIE market cap. Use the computed tick instead, with one
      // position starting exactly at it (SDK/factory requirement).
      tickIfToken0IsClanker: req.startingTick ?? DEFAULT_TICK,
      positions: [
        {
          tickLower: req.startingTick ?? DEFAULT_TICK,
          tickUpper: (req.startingTick ?? DEFAULT_TICK) + POSITION_WIDTH,
          positionBps: 10_000,
        },
      ],
    },
    fees: { type: 'static', clankerFee: 100, pairedFee: 100 },
    rewards: {
      recipients: [
        { admin: req.creator, recipient: req.creator, bps: creatorBps, token: 'Both' },
        {
          admin: launcher.feeRecipient,
          recipient: launcher.feeRecipient,
          bps: launcher.feeShareBps,
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
