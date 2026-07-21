/**
 * Minimal ABIs for OUR wrapper contracts (contracts/src/*.sol) plus the one
 * Clanker factory event needed for verification. Shared by the mini app and
 * any script; kept in sync with the Solidity sources by the Foundry tests.
 */

export const launcherLauncherAbi = [
  {
    type: 'function',
    name: 'createLauncher',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name_', type: 'string' },
      { name: 'feeRecipient_', type: 'address' },
      { name: 'lpRewardBps_', type: 'uint16' },
    ],
    outputs: [{ name: 'launcher', type: 'address' }],
  },
  {
    type: 'function',
    name: 'allLaunchers',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: 'list',
        type: 'tuple[]',
        components: [
          { name: 'launcher', type: 'address' },
          { name: 'creator', type: 'address' },
          { name: 'name', type: 'string' },
          { name: 'feeRecipient', type: 'address' },
          { name: 'lpRewardBps', type: 'uint16' },
          { name: 'createdAt', type: 'uint64' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'launcherCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'implementation',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'event',
    name: 'LauncherCreated',
    inputs: [
      { name: 'launcher', type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'feeRecipient', type: 'address', indexed: false },
      { name: 'lpRewardBps', type: 'uint16', indexed: false },
    ],
  },
] as const;

export const launcherAbi = [
  {
    type: 'function',
    name: 'launch',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'p',
        type: 'tuple',
        components: [
          // NOTE: no pairedToken field exists — locked to $HOODIE in the contract.
          { name: 'name', type: 'string' },
          { name: 'symbol', type: 'string' },
          { name: 'image', type: 'string' },
          { name: 'metadata', type: 'string' },
          { name: 'context', type: 'string' },
          { name: 'tokenAdmin', type: 'address' },
          { name: 'startingTick', type: 'int24' },
          { name: 'clankerFeeBps', type: 'uint24' },
          { name: 'pairedFeeBps', type: 'uint24' },
        ],
      },
    ],
    outputs: [{ name: 'token', type: 'address' }],
  },
  { type: 'function', name: 'HOODIE', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'launcherName', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'feeRecipient', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'lpRewardBps', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  { type: 'function', name: 'launchCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'tokens', stateMutability: 'view', inputs: [], outputs: [{ type: 'address[]' }] },
  {
    type: 'event',
    name: 'TokenLaunched',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'symbol', type: 'string', indexed: false },
      { name: 'pairedToken', type: 'address', indexed: false },
      { name: 'startingTick', type: 'int24', indexed: false },
    ],
  },
] as const;

/** The Clanker v4 factory's TokenCreated event — the on-chain proof of pairing. */
export const clankerTokenCreatedEventAbi = [
  {
    type: 'event',
    name: 'TokenCreated',
    inputs: [
      { name: 'msgSender', type: 'address', indexed: false },
      { name: 'tokenAddress', type: 'address', indexed: true },
      { name: 'tokenAdmin', type: 'address', indexed: true },
      { name: 'tokenImage', type: 'string', indexed: false },
      { name: 'tokenName', type: 'string', indexed: false },
      { name: 'tokenSymbol', type: 'string', indexed: false },
      { name: 'tokenMetadata', type: 'string', indexed: false },
      { name: 'tokenContext', type: 'string', indexed: false },
      { name: 'startingTick', type: 'int24', indexed: false },
      { name: 'poolHook', type: 'address', indexed: false },
      { name: 'poolId', type: 'bytes32', indexed: false },
      { name: 'pairedToken', type: 'address', indexed: false },
      { name: 'locker', type: 'address', indexed: false },
      { name: 'mevModule', type: 'address', indexed: false },
      { name: 'extensionsSupply', type: 'uint256', indexed: false },
      { name: 'extensions', type: 'address[]', indexed: false },
    ],
  },
] as const;
