import { robinhood } from 'clanker-sdk';

// The canonical constants live in src/hoodie.ts (dependency-free, shared with
// the mini app). Re-exported here for the Node-only CLI modules.
export { CHAIN_ID, EXPLORER_URL, HOODIE_ADDRESS } from './hoodie.js';

export const CHAIN = robinhood;

/** Share of LP fee rewards routed to the Launcher's fee recipient (bps of the reward split). */
export const DEFAULT_LAUNCHER_FEE_SHARE_BPS = 2000;
