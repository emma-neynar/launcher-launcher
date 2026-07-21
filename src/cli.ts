import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { clankerConfigFor } from 'clanker-sdk';
import { Command } from 'commander';
import { decodeFunctionData, isAddress, isAddressEqual } from 'viem';
import { CHAIN_ID, EXPLORER_URL, HOODIE_ADDRESS } from './constants';
import {
  DEFAULT_LP_REWARD_BPS,
  MAX_LP_REWARD_BPS,
  formatPct,
  grossFeeSplit,
  isValidLpRewardBps,
} from './fees';
import { fetchHoodiePriceUsd } from './hoodie-price';
import { launchToken, publicClient } from './launch';
import { type Launcher, getLauncher, loadRegistry, saveRegistry, slugify } from './registry';
import { CANONICAL_OPENING_TICK, TICK_SPACING, marketCapForTick } from './tick';

function grossSplitLine(lpRewardBps: number): string {
  const s = grossFeeSplit(lpRewardBps);
  return (
    `Clanker protocol ${formatPct(s.clankerPct)}% (documented protocol fee, fixed) / ` +
    `token creator ${formatPct(s.creatorPct)}% / launcher ${formatPct(s.launcherPct)}% — gross of all LP fees`
  );
}

const program = new Command()
  .name('launcher-launcher')
  .description('A launcher of $HOODIE-paired token launchers on Robinhood Chain');

function requireAddress(value: string, label: string): `0x${string}` {
  if (!isAddress(value)) throw new Error(`${label} is not a valid address: ${value}`);
  return value;
}

async function confirmOrAbort(prompt: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${prompt}\nType LAUNCH to continue, anything else aborts: `);
  rl.close();
  if (answer.trim() !== 'LAUNCH') {
    console.log('Aborted. Nothing was sent.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Layer 2: Launcher Launcher — spin up a Launcher as easily as a token.
// ---------------------------------------------------------------------------
program
  .command('create-launcher')
  .description('Create a new Launcher. It inherits the immutable $HOODIE pairing rule.')
  .requiredOption('--name <name>', 'launcher name')
  .requiredOption('--fee-recipient <address>', 'address receiving the launcher share of LP fee rewards')
  .option('--lp-reward-bps <bps>', `the ONE launcher knob: operator cut of the reward pool (0-${MAX_LP_REWARD_BPS})`, String(DEFAULT_LP_REWARD_BPS))
  .option('--description <text>', 'what this launcher is about')
  .action(async (opts: { name: string; feeRecipient: string; lpRewardBps: string; description?: string }) => {
    const lpRewardBps = Number(opts.lpRewardBps);
    if (!isValidLpRewardBps(lpRewardBps)) {
      throw new Error(`--lp-reward-bps must be an integer between 0 and ${MAX_LP_REWARD_BPS}`);
    }
    const launchers = await loadRegistry();
    const id = slugify(opts.name);
    if (launchers.some((l) => l.id === id)) throw new Error(`Launcher "${id}" already exists.`);

    const launcher: Launcher = {
      id,
      name: opts.name,
      feeRecipient: requireAddress(opts.feeRecipient, '--fee-recipient'),
      lpRewardBps,
      description: opts.description,
      pairedToken: HOODIE_ADDRESS,
      createdAt: new Date().toISOString(),
      launches: [],
    };
    launchers.push(launcher);
    await saveRegistry(launchers);

    console.log(`Launcher "${opts.name}" created (id: ${id}).`);
    console.log(`Fee recipient: ${launcher.feeRecipient}`);
    console.log(`Gross fee split: ${grossSplitLine(lpRewardBps)}`);
    console.log(`Paired token (immutable): $HOODIE ${HOODIE_ADDRESS}`);
    console.log(`\nLaunch a token through it:\n  npm run ll -- launch --launcher ${id} --name "My Token" --symbol MTK --creator 0x...`);
  });

program
  .command('list')
  .description('List registered launchers and their launches')
  .action(async () => {
    const launchers = await loadRegistry();
    if (launchers.length === 0) {
      console.log('No launchers yet. Create one with `npm run ll -- create-launcher`.');
      return;
    }
    for (const l of launchers) {
      console.log(`\n${l.name} (id: ${l.id})`);
      if (l.description) console.log(`  ${l.description}`);
      console.log(`  fee recipient: ${l.feeRecipient}`);
      console.log(`  gross fees:    ${grossSplitLine(l.lpRewardBps)}`);
      console.log(`  paired token:  $HOODIE ${l.pairedToken} (locked)`);
      console.log(`  launches:      ${l.launches.length === 0 ? 'none yet' : ''}`);
      for (const t of l.launches) {
        console.log(`    - ${t.symbol} ${t.token} [${t.mode}]${t.txHash ? ` tx ${t.txHash}` : ''}`);
      }
    }
  });

// ---------------------------------------------------------------------------
// Layer 1: Launcher — deploy a token, force-paired with $HOODIE.
// ---------------------------------------------------------------------------
program
  .command('launch')
  .description('Launch a token through a Launcher. DRY-RUN by default; --live broadcasts after confirmation.')
  .requiredOption('--launcher <id>', 'launcher id or name')
  .requiredOption('--name <name>', 'token name')
  .requiredOption('--symbol <symbol>', 'token symbol')
  .requiredOption('--creator <address>', 'token creator (admin + majority reward recipient)')
  .option('--image <url>', 'token image (http or ipfs url)')
  .option('--description <text>', 'token description')
  .option('--tick <tick>', `ADVANCED: override the canonical opening tick (${CANONICAL_OPENING_TICK}); off-whitelist launches may be flagged by clanker.world`)
  .option('--paired-token <address>', 'IGNORED unless it equals $HOODIE — pairing is locked')
  .option('--live', 'broadcast to Robinhood Chain mainnet (requires PRIVATE_KEY + confirmation)', false)
  .action(async (opts: {
    launcher: string;
    name: string;
    symbol: string;
    creator: string;
    image?: string;
    description?: string;
    tick?: string;
    pairedToken?: string;
    live: boolean;
  }) => {
    const launcher = await getLauncher(opts.launcher);
    console.log(`Launcher: ${launcher.name} — every token it launches is paired with $HOODIE.`);
    console.log(`Gross fee split: ${grossSplitLine(launcher.lpRewardBps)}`);

    let startingTick: number;
    if (opts.tick !== undefined) {
      startingTick = Number(opts.tick);
      if (!Number.isInteger(startingTick) || startingTick % TICK_SPACING !== 0) {
        throw new Error(`--tick must be an integer multiple of ${TICK_SPACING}`);
      }
      console.log(
        `WARNING: manual tick ${startingTick} ≈ ${Math.round(marketCapForTick(startingTick)).toLocaleString()} $HOODIE starting market cap — ` +
          `this deviates from the canonical whitelisted tick (${CANONICAL_OPENING_TICK}).`
      );
    } else {
      startingTick = CANONICAL_OPENING_TICK;
      const mcapHoodie = Math.round(marketCapForTick(startingTick));
      let usd = '';
      try {
        const price = await fetchHoodiePriceUsd();
        usd = ` ≈ $${Math.round(mcapHoodie * price.priceUsd).toLocaleString()} at the live price (source: ${price.source})`;
      } catch {
        // USD display is best-effort; the tick itself never depends on it.
      }
      console.log(
        `Opening tick: ${startingTick} (canonical, fixed for whitelisting) ≈ ${mcapHoodie.toLocaleString()} $HOODIE market cap${usd}.`
      );
    }

    if (opts.live) {
      await confirmOrAbort(
        `\nYou are about to deploy "${opts.name}" (${opts.symbol}) on Robinhood Chain MAINNET,\n` +
          `paired with $HOODIE (${HOODIE_ADDRESS}), paying gas from your dev wallet.`
      );
    }

    const result = await launchToken(
      launcher,
      {
        name: opts.name,
        symbol: opts.symbol,
        image: opts.image,
        description: opts.description,
        creator: requireAddress(opts.creator, '--creator'),
        startingTick,
        requestedPairedToken: opts.pairedToken,
      },
      { live: opts.live }
    );

    const launchers = await loadRegistry();
    const entry = launchers.find((l) => l.id === launcher.id);
    entry?.launches.push({
      name: opts.name,
      symbol: opts.symbol,
      token: result.expectedAddress,
      txHash: result.txHash,
      mode: result.mode,
      at: new Date().toISOString(),
    });
    await saveRegistry(launchers);
  });

program
  .command('expected-position')
  .description(
    'Print the exact pool/position config clanker.world should whitelist as an "expected position" for launches from this app'
  )
  .action(async () => {
    // Encode a real deployToken() transaction (read-only) with a throwaway
    // token so the printed values are exactly what the shipped app sends —
    // hook address and poolData included — rather than hand-copied constants.
    const { buildLockedTokenConfig } = await import('./hoodie-lock');
    const { POOL_FEE_BPS, DEFAULT_LP_REWARD_BPS } = await import('./fees');
    const { POSITION_WIDTH } = await import('./tick');
    const { Clanker } = await import('clanker-sdk/v4');

    const placeholder: Launcher = {
      id: 'expected-position-probe',
      name: 'probe',
      feeRecipient: '0x000000000000000000000000000000000000dEaD',
      lpRewardBps: DEFAULT_LP_REWARD_BPS,
      pairedToken: HOODIE_ADDRESS,
      createdAt: new Date().toISOString(),
      launches: [],
    };
    const config = buildLockedTokenConfig(placeholder, {
      name: 'probe',
      symbol: 'PROBE',
      creator: '0x000000000000000000000000000000000000dEaD',
    });
    const clanker = new Clanker({ publicClient: publicClient() });
    const tx = await clanker.getDeployTransaction(config);
    const d = tx.args[0];

    console.log('Expected position config for clanker.world (whitelist request):\n');
    console.log(`  chain:            Robinhood Chain (${CHAIN_ID})`);
    console.log(`  factory:          ${tx.address} (Clanker v4)`);
    console.log(`  pairedToken:      ${d.poolConfig.pairedToken} ($HOODIE)`);
    console.log(`  opening tick:     ${CANONICAL_OPENING_TICK} (tickIfToken0IsClanker; fixed — see src/tick.ts)`);
    console.log(`  tickSpacing:      ${d.poolConfig.tickSpacing}`);
    console.log(`  position:         tickLower ${CANONICAL_OPENING_TICK}, tickUpper ${CANONICAL_OPENING_TICK + POSITION_WIDTH}, positionBps 10000 (single full-range-up position)`);
    console.log(`  pool fee:         static, ${POOL_FEE_BPS} bps each side (clankerFee = pairedFee; TODO(dev): confirm final value)`);
    console.log(`  hook:             ${d.poolConfig.hook}`);
    console.log(`  locker:           ${d.lockerConfig.locker}`);
    console.log(`  poolData:         ${d.poolConfig.poolData}`);
    console.log('\nTODO(dev answer pending): whether clanker.world wants a fixed tick or a range;');
    console.log('the app ships the single fixed tick above (CANONICAL_OPENING_TICK, one constant).');
  });

program
  .command('verify')
  .description('Prove a deploy tx was $HOODIE-paired by decoding its on-chain calldata')
  .requiredOption('--tx <hash>', 'deployToken transaction hash on Robinhood Chain')
  .action(async (opts: { tx: string }) => {
    const config = clankerConfigFor(CHAIN_ID, 'clanker_v4');
    if (!config) throw new Error('No Clanker v4 config for Robinhood Chain in the SDK.');

    const tx = await publicClient().getTransaction({ hash: opts.tx as `0x${string}` });
    if (!tx.to || !isAddressEqual(tx.to, config.address)) {
      throw new Error(`Transaction was not sent to the Clanker v4 factory (${config.address}).`);
    }
    const { functionName, args } = decodeFunctionData({ abi: config.abi, data: tx.input });
    if (functionName !== 'deployToken') throw new Error(`Not a deployToken call (${functionName}).`);

    const deploymentConfig = (args as [{ poolConfig: { pairedToken: `0x${string}` }; tokenConfig: { name: string; symbol: string } }])[0];
    const paired = deploymentConfig.poolConfig.pairedToken;
    const ok = isAddressEqual(paired, HOODIE_ADDRESS);

    console.log(`Token:        ${deploymentConfig.tokenConfig.name} (${deploymentConfig.tokenConfig.symbol})`);
    console.log(`Factory:      ${config.address}`);
    console.log(`Paired token: ${paired}`);
    console.log(`Explorer:     ${EXPLORER_URL}/tx/${opts.tx}`);
    console.log(ok ? '\nVERIFIED: paired with $HOODIE.' : '\nFAILED: NOT paired with $HOODIE!');
    if (!ok) process.exit(1);
  });

program.parseAsync().catch((err: unknown) => {
  console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
