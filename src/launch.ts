import { Clanker } from 'clanker-sdk/v4';
import {
  http,
  type Account,
  type PublicClient,
  createPublicClient,
  createWalletClient,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { CHAIN, EXPLORER_URL, HOODIE_ADDRESS } from './constants.js';
import { type LaunchRequest, assertHoodieInCalldata, buildLockedTokenConfig } from './hoodie-lock.js';
import type { Launcher } from './registry.js';

const rpcUrl = process.env.RPC_URL; // undefined -> chain default RPC

export function publicClient(): PublicClient {
  return createPublicClient({ chain: CHAIN, transport: http(rpcUrl) }) as PublicClient;
}

export function loadDevWallet(): Account {
  const key = process.env.PRIVATE_KEY;
  if (!key) {
    throw new Error('PRIVATE_KEY missing from .env — required for --live. Use a fresh dev wallet.');
  }
  return privateKeyToAccount(key as `0x${string}`);
}

export type LaunchResult = {
  mode: 'dry-run' | 'live';
  expectedAddress: `0x${string}`;
  pairedTokenInCalldata: `0x${string}`;
  txHash?: `0x${string}`;
};

/**
 * The full launch pipeline. Order matters:
 *  1. build config with pairedToken hardcoded to $HOODIE (rejects overrides)
 *  2. SDK encodes the raw deployToken() args
 *  3. re-verify $HOODIE in the encoded calldata (defense in depth)
 *  4. simulate via eth_call — always, even for live
 *  5. only broadcast when live=true (caller has already gated this behind
 *     an explicit --live flag AND an interactive confirmation)
 */
export async function launchToken(
  launcher: Launcher,
  req: LaunchRequest,
  { live }: { live: boolean }
): Promise<LaunchResult> {
  const pub = publicClient();

  // Dry runs don't need a real key: simulate from an ephemeral throwaway account.
  const account = live ? loadDevWallet() : privateKeyToAccount(generatePrivateKey());

  const config = buildLockedTokenConfig(launcher, req);

  const clanker = live
    ? new Clanker({
        publicClient: pub,
        wallet: createWalletClient({ account, chain: CHAIN, transport: http(rpcUrl) }),
      })
    : new Clanker({ publicClient: pub });

  // Step 2: raw factory call as the SDK will encode it.
  const tx = await clanker.getDeployTransaction(config);
  const deploymentConfig = tx.args[0];

  // Step 3: verify the ENCODED transaction, not just our own config.
  assertHoodieInCalldata(deploymentConfig);

  console.log(`\nFactory:        ${tx.address} (Clanker v4, Robinhood Chain)`);
  console.log(`Function:       ${tx.functionName}`);
  console.log(`Paired token:   ${deploymentConfig.poolConfig.pairedToken}  <-- $HOODIE, verified in calldata`);
  console.log(`Token admin:    ${deploymentConfig.tokenConfig.tokenAdmin}`);
  console.log(
    `Reward split:   ${deploymentConfig.lockerConfig.rewardRecipients
      .map((r, i) => `${r} (${Number(deploymentConfig.lockerConfig.rewardBps[i]) / 100}%)`)
      .join(', ')}`
  );
  console.log(`Predicted token address: ${tx.expectedAddress}`);

  // Step 4: eth_call simulation against Robinhood mainnet — read-only, nothing broadcast.
  console.log('\nSimulating deployToken() via eth_call...');
  const sim = await clanker.deploySimulate(config, account);
  if (sim.error) throw sim.error;
  console.log(`Simulation OK. Factory would deploy token at ${tx.expectedAddress}`);

  if (!live) {
    console.log('\nDRY RUN complete — no transaction was broadcast. Re-run with --live to deploy.');
    return {
      mode: 'dry-run',
      expectedAddress: tx.expectedAddress as `0x${string}`,
      pairedTokenInCalldata: deploymentConfig.poolConfig.pairedToken,
    };
  }

  // Step 5: broadcast.
  const { txHash, error, waitForTransaction } = await clanker.deploy(config);
  if (error) throw error;
  console.log(`\nBroadcast: ${EXPLORER_URL}/tx/${txHash}`);
  const { address: tokenAddress } = await waitForTransaction();
  console.log(`Token deployed: ${EXPLORER_URL}/token/${tokenAddress}`);
  console.log(`Paired with $HOODIE: ${HOODIE_ADDRESS}`);

  return {
    mode: 'live',
    expectedAddress: (tokenAddress ?? tx.expectedAddress) as `0x${string}`,
    pairedTokenInCalldata: deploymentConfig.poolConfig.pairedToken,
    txHash,
  };
}
