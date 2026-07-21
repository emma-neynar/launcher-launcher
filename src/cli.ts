import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { clankerConfigFor } from 'clanker-sdk';
import { Command } from 'commander';
import { decodeFunctionData, isAddress, isAddressEqual } from 'viem';
import { CHAIN_ID, DEFAULT_LAUNCHER_FEE_SHARE_BPS, EXPLORER_URL, HOODIE_ADDRESS } from './constants.js';
import { launchToken, publicClient } from './launch.js';
import { type Launcher, getLauncher, loadRegistry, saveRegistry, slugify } from './registry.js';

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
  .option('--fee-share-bps <bps>', 'reward split routed to the launcher (0-5000)', String(DEFAULT_LAUNCHER_FEE_SHARE_BPS))
  .option('--description <text>', 'what this launcher is about')
  .action((opts: { name: string; feeRecipient: string; feeShareBps: string; description?: string }) => {
    const feeShareBps = Number(opts.feeShareBps);
    if (!Number.isInteger(feeShareBps) || feeShareBps < 0 || feeShareBps > 5000) {
      throw new Error('--fee-share-bps must be an integer between 0 and 5000');
    }
    const launchers = loadRegistry();
    const id = slugify(opts.name);
    if (launchers.some((l) => l.id === id)) throw new Error(`Launcher "${id}" already exists.`);

    const launcher: Launcher = {
      id,
      name: opts.name,
      feeRecipient: requireAddress(opts.feeRecipient, '--fee-recipient'),
      feeShareBps,
      description: opts.description,
      pairedToken: HOODIE_ADDRESS,
      createdAt: new Date().toISOString(),
      launches: [],
    };
    launchers.push(launcher);
    saveRegistry(launchers);

    console.log(`Launcher "${opts.name}" created (id: ${id}).`);
    console.log(`Fee recipient: ${launcher.feeRecipient} (${feeShareBps / 100}% of LP rewards)`);
    console.log(`Paired token (immutable): $HOODIE ${HOODIE_ADDRESS}`);
    console.log(`\nLaunch a token through it:\n  npm run ll -- launch --launcher ${id} --name "My Token" --symbol MTK --creator 0x...`);
  });

program
  .command('list')
  .description('List registered launchers and their launches')
  .action(() => {
    const launchers = loadRegistry();
    if (launchers.length === 0) {
      console.log('No launchers yet. Create one with `npm run ll -- create-launcher`.');
      return;
    }
    for (const l of launchers) {
      console.log(`\n${l.name} (id: ${l.id})`);
      if (l.description) console.log(`  ${l.description}`);
      console.log(`  fee recipient: ${l.feeRecipient} (${l.feeShareBps / 100}%)`);
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
  .option('--paired-token <address>', 'IGNORED unless it equals $HOODIE — pairing is locked')
  .option('--live', 'broadcast to Robinhood Chain mainnet (requires PRIVATE_KEY + confirmation)', false)
  .action(async (opts: {
    launcher: string;
    name: string;
    symbol: string;
    creator: string;
    image?: string;
    description?: string;
    pairedToken?: string;
    live: boolean;
  }) => {
    const launcher = getLauncher(opts.launcher);
    console.log(`Launcher: ${launcher.name} — every token it launches is paired with $HOODIE.`);

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
        requestedPairedToken: opts.pairedToken,
      },
      { live: opts.live }
    );

    const launchers = loadRegistry();
    const entry = launchers.find((l) => l.id === launcher.id);
    entry?.launches.push({
      name: opts.name,
      symbol: opts.symbol,
      token: result.expectedAddress,
      txHash: result.txHash,
      mode: result.mode,
      at: new Date().toISOString(),
    });
    saveRegistry(launchers);
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
