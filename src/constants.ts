import { robinhood } from 'clanker-sdk';

// The canonical constants live in src/hoodie.ts (dependency-free, shared with
// the mini app). Re-exported here for the Node-only CLI modules.
export { CHAIN_ID, EXPLORER_URL, HOODIE_ADDRESS } from './hoodie';

export const CHAIN = robinhood;
