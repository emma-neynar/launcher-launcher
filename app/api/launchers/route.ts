import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { isValidLpRewardBps, MAX_LP_REWARD_BPS } from '@/src/fees';
import { HOODIE_ADDRESS } from '@/src/hoodie';
import { type Launcher, loadRegistry, saveRegistry, slugify } from '@/src/registry';

/**
 * The launcher registry for the off-chain (primary) model: a launcher is just
 * a saved {name, feeRecipient, lpRewardBps} config that gets baked into the
 * Clanker deploy's rewardRecipients/rewardBps at launch time. Registry-only —
 * this store never holds or routes funds. Backed by src/registry.ts: Vercel
 * KV / Upstash when REST creds are set, otherwise the same JSON file the CLI
 * uses (registry/launchers.json). See README "Launcher persistence".
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await loadRegistry());
}

export async function POST(request: Request) {
  let body: { name?: unknown; feeRecipient?: unknown; lpRewardBps?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 64) {
    return NextResponse.json({ error: 'name must be 1-64 characters' }, { status: 400 });
  }
  const feeRecipient = typeof body.feeRecipient === 'string' ? body.feeRecipient : '';
  if (!isAddress(feeRecipient)) {
    return NextResponse.json({ error: 'feeRecipient must be a valid address' }, { status: 400 });
  }
  // The ONE user-set launcher parameter (see src/fees.ts).
  const lpRewardBps = Number(body.lpRewardBps);
  if (!isValidLpRewardBps(lpRewardBps)) {
    return NextResponse.json(
      { error: `lpRewardBps must be an integer between 0 and ${MAX_LP_REWARD_BPS}` },
      { status: 400 }
    );
  }

  const launchers = await loadRegistry();
  const id = slugify(name);
  if (!id) return NextResponse.json({ error: 'name needs at least one letter or number' }, { status: 400 });
  if (launchers.some((l) => l.id === id)) {
    return NextResponse.json({ error: `a launcher named "${id}" already exists` }, { status: 409 });
  }

  const launcher: Launcher = {
    id,
    name,
    feeRecipient: feeRecipient as `0x${string}`,
    lpRewardBps,
    pairedToken: HOODIE_ADDRESS,
    createdAt: new Date().toISOString(),
    launches: [],
  };
  launchers.push(launcher);
  await saveRegistry(launchers);

  return NextResponse.json(launcher, { status: 201 });
}
