/**
 * THE RULE. $HOODIE on Robinhood Chain — the immutable paired token for every
 * launch. This module is dependency-free so both the CLI (Node) and the mini
 * app (browser bundle) share the same constant. It must match the `HOODIE`
 * constant in contracts/src/Launcher.sol (asserted by tests).
 */
export const HOODIE_ADDRESS = '0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3' as const;

export const CHAIN_ID = 4663 as const;
export const EXPLORER_URL = 'https://robinhoodchain.blockscout.com';
export const DEFAULT_RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';

/** Already-deployed Clanker v4 periphery on Robinhood Chain (clanker-sdk v4.2.18). */
export const CLANKER_FACTORY = '0xD3f2cC1731b7Fd17f28798835C2E02f0a1839A94' as const;

/**
 * ClankerFeeLocker on Robinhood Chain — where LP fee rewards accrue until
 * claimed via claim(feeOwner, token). Resolved live from the LpLocker's
 * feeLocker() getter (0x290F…Bc99, emitter of TokenRewardAdded on deploys).
 */
export const CLANKER_FEE_LOCKER = '0x88db2340bE5991B2b5Fca2Baee39B5CE048Cd70c' as const;
