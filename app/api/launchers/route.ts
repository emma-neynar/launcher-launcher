import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { isValidLpRewardBps, MAX_LP_REWARD_BPS } from '@/src/fees';
import { HOODIE_ADDRESS } from '@/src/hoodie';
import { createLauncherMessage, isFreshIssuedAt } from '@/src/launcher-auth';
import { allowWrite, clientIp } from '@/src/rate-limit';
import {
  type Launcher,
  loadRegistry,
  MAX_LAUNCHERS,
  mutateRegistry,
  RegistryWriteRejected,
  slugify,
} from '@/src/registry';
import { serverPublicClient } from '@/src/rpc';

/**
 * The launcher registry for the off-chain (primary) model: a launcher is just
 * a saved {name, feeRecipient, lpRewardBps} config that gets baked into the
 * Clanker deploy's rewardRecipients/rewardBps at launch time. Registry-only —
 * this store never holds or routes funds. Backed by src/registry.ts: Vercel
 * KV / Upstash when REST creds are set, otherwise the same JSON file the CLI
 * uses (registry/launchers.json). See README "Launcher persistence".
 *
 * Writes are authenticated (finding A-01): the POST must carry a
 * personal_sign signature from feeRecipient over the exact launcher config
 * plus a fresh timestamp (src/launcher-auth.ts), verified here with viem.
 * Existing registry entries predate this and are read/served unchanged.
 */

export const dynamic = 'force-dynamic';

/** Generous bound on a create-launcher body (a few short fields + signature). */
const MAX_BODY_BYTES = 8_192;

export async function GET() {
  return NextResponse.json(await loadRegistry());
}

export async function POST(request: Request) {
  if (!(await allowWrite('create-launcher', clientIp(request)))) {
    return NextResponse.json({ error: 'slow down, dawg — try again in a minute' }, { status: 429 });
  }

  let body: {
    name?: unknown;
    feeRecipient?: unknown;
    lpRewardBps?: unknown;
    signature?: unknown;
    issuedAt?: unknown;
    creatorFid?: unknown;
    creatorUsername?: unknown;
    creatorPfpUrl?: unknown;
  };
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'request body too large' }, { status: 413 });
    }
    body = JSON.parse(raw);
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

  // --- Signature check (finding A-01): the fee recipient must prove control
  // of their wallet by signing the exact config being registered. issuedAt is
  // bound into the signed text and must be fresh, so a captured signature
  // can't be replayed later to recreate a deleted/renamed launcher.
  const issuedAt = typeof body.issuedAt === 'string' ? body.issuedAt : '';
  if (!isFreshIssuedAt(issuedAt)) {
    return NextResponse.json({ error: 'signature expired — sign again and resubmit' }, { status: 400 });
  }
  const signature = typeof body.signature === 'string' ? body.signature : '';
  if (!/^0x[0-9a-fA-F]+$/.test(signature)) {
    return NextResponse.json({ error: 'a wallet signature from feeRecipient is required' }, { status: 401 });
  }
  let signatureOk = false;
  try {
    // The public-client action (not the EOA-only util) so ERC-1271/6492 smart
    // wallets verify too; for plain EOAs it recovers locally without an RPC.
    signatureOk = await serverPublicClient().verifyMessage({
      address: feeRecipient,
      message: createLauncherMessage({ name, feeRecipient, lpRewardBps, issuedAt }),
      signature: signature as `0x${string}`,
    });
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) {
    return NextResponse.json({ error: "signature doesn't match feeRecipient" }, { status: 401 });
  }

  // Optional Farcaster creator identity (present only when created from the
  // mini app; the plain web and the CLI never send these). Deliberately NOT
  // verified against Farcaster (no Neynar/hub integration exists in this
  // repo): it is display-only data, and it is only accepted here — after the
  // signature check above — so the wallet owner vouches for their own
  // claimed identity rather than an anonymous caller spoofing someone else's.
  let creatorFid: number | undefined;
  if (body.creatorFid !== undefined) {
    const fid = Number(body.creatorFid);
    if (!Number.isInteger(fid) || fid <= 0) {
      return NextResponse.json({ error: 'creatorFid must be a positive integer' }, { status: 400 });
    }
    creatorFid = fid;
  }
  let creatorUsername: string | undefined;
  if (body.creatorUsername !== undefined) {
    if (typeof body.creatorUsername !== 'string') {
      return NextResponse.json({ error: 'creatorUsername must be a string' }, { status: 400 });
    }
    const username = body.creatorUsername.trim().replace(/^@/, '');
    if (!username || username.length > 32) {
      return NextResponse.json(
        { error: 'creatorUsername must be 1-32 characters' },
        { status: 400 }
      );
    }
    creatorUsername = username;
  }
  let creatorPfpUrl: string | undefined;
  if (body.creatorPfpUrl !== undefined) {
    const pfpUrl = typeof body.creatorPfpUrl === 'string' ? body.creatorPfpUrl.trim() : '';
    if (!/^https?:\/\//.test(pfpUrl) || pfpUrl.length > 512) {
      return NextResponse.json(
        { error: 'creatorPfpUrl must be an http(s) URL of at most 512 characters' },
        { status: 400 }
      );
    }
    creatorPfpUrl = pfpUrl;
  }

  const id = slugify(name);
  if (!id) return NextResponse.json({ error: 'name needs at least one letter or number' }, { status: 400 });

  const launcher: Launcher = {
    id,
    name,
    feeRecipient: feeRecipient as `0x${string}`,
    lpRewardBps,
    ...(creatorFid !== undefined && { creatorFid }),
    ...(creatorUsername !== undefined && { creatorUsername }),
    ...(creatorPfpUrl !== undefined && { creatorPfpUrl }),
    pairedToken: HOODIE_ADDRESS,
    createdAt: new Date().toISOString(),
    launches: [],
  };

  try {
    // Uniqueness and the size cap are checked inside the atomic mutation so
    // they always see the freshest registry, even under concurrent writes.
    await mutateRegistry((launchers) => {
      if (launchers.length >= MAX_LAUNCHERS) {
        throw new RegistryWriteRejected(403, 'the registry is full — no new launchers for now');
      }
      if (launchers.some((l) => l.id === id)) {
        throw new RegistryWriteRejected(409, `a launcher named "${id}" already exists`);
      }
      return [...launchers, launcher];
    });
  } catch (e) {
    if (e instanceof RegistryWriteRejected) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  return NextResponse.json(launcher, { status: 201 });
}
