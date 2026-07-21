import { robinhood } from 'clanker-sdk';

/**
 * THE RULE. Every token launched through any Launcher created by
 * Launcher Launcher is paired with $HOODIE. This is a frozen constant:
 * nothing in this codebase reads a paired token from user input, config
 * files, env vars, or the network.
 */
export const HOODIE_ADDRESS = '0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3' as const;

export const CHAIN = robinhood;
export const CHAIN_ID = 4663 as const;
export const EXPLORER_URL = 'https://robinhoodchain.blockscout.com';

/** Share of LP fee rewards routed to the Launcher's fee recipient (bps of the reward split). */
export const DEFAULT_LAUNCHER_FEE_SHARE_BPS = 2000;
