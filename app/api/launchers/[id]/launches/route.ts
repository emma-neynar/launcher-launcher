import { NextResponse } from 'next/server';
import { isAddress, parseEventLogs, type TransactionReceipt } from 'viem';
import { CLANKER_FACTORY, HOODIE_ADDRESS } from '@/src/hoodie';
import { allowWrite, clientIp } from '@/src/rate-limit';
import {
  MAX_LAUNCHES_PER_LAUNCHER,
  mutateRegistry,
  RegistryWriteRejected,
} from '@/src/registry';
import { serverPublicClient } from '@/src/rpc';
import { clankerTokenCreatedEventAbi } from '@/src/wrapper-abi';

export const dynamic = 'force-dynamic';

/** Generous bound on a record-launch body (a few short fields). */
const MAX_BODY_BYTES = 8_192;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The client only POSTs after its own receipt wait succeeded, so the tx is
 * already mined — but our RPC node may lag a beat behind theirs. One short
 * retry covers that; anything longer means the hash is bogus.
 */
async function fetchReceipt(txHash: `0x${string}`): Promise<TransactionReceipt | null> {
  const client = serverPublicClient();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await client.getTransactionReceipt({ hash: txHash });
    } catch {
      if (attempt === 0) await sleep(2_000);
    }
  }
  return null;
}

/**
 * Record a completed (user-signed) launch against a launcher. Display-only
 * data, but no longer trusted from the POST body (finding A-02): the tx
 * receipt is fetched from the chain and the Clanker factory's own
 * TokenCreated event must prove the claimed token exists, is $HOODIE-paired,
 * and carries the name/symbol we store.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!(await allowWrite('record-launch', clientIp(request)))) {
    return NextResponse.json({ error: 'slow down, dawg — try again in a minute' }, { status: 429 });
  }

  let body: {
    name?: unknown;
    symbol?: unknown;
    token?: unknown;
    txHash?: unknown;
    launcherFid?: unknown;
    launcherUsername?: unknown;
    launcherPfpUrl?: unknown;
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

  const token = typeof body.token === 'string' ? body.token : '';
  if (!isAddress(token)) {
    return NextResponse.json({ error: 'a valid token address is required' }, { status: 400 });
  }
  const txHash = typeof body.txHash === 'string' ? body.txHash : '';
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: 'txHash of the launch transaction is required' }, { status: 400 });
  }

  // Optional Farcaster identity of the launching user (present only when the
  // launch came from the mini app) — same rules as the launcher creator
  // fields in app/api/launchers/route.ts. Display-only; the verifiable facts
  // (token, pairing, sender) all come from the receipt below.
  let launcherFid: number | undefined;
  if (body.launcherFid !== undefined) {
    const fid = Number(body.launcherFid);
    if (!Number.isInteger(fid) || fid <= 0) {
      return NextResponse.json({ error: 'launcherFid must be a positive integer' }, { status: 400 });
    }
    launcherFid = fid;
  }
  let launcherUsername: string | undefined;
  if (body.launcherUsername !== undefined) {
    if (typeof body.launcherUsername !== 'string') {
      return NextResponse.json({ error: 'launcherUsername must be a string' }, { status: 400 });
    }
    const username = body.launcherUsername.trim().replace(/^@/, '');
    if (!username || username.length > 32) {
      return NextResponse.json(
        { error: 'launcherUsername must be 1-32 characters' },
        { status: 400 }
      );
    }
    launcherUsername = username;
  }
  let launcherPfpUrl: string | undefined;
  if (body.launcherPfpUrl !== undefined) {
    const pfpUrl = typeof body.launcherPfpUrl === 'string' ? body.launcherPfpUrl.trim() : '';
    if (!/^https?:\/\//.test(pfpUrl) || pfpUrl.length > 512) {
      return NextResponse.json(
        { error: 'launcherPfpUrl must be an http(s) URL of at most 512 characters' },
        { status: 400 }
      );
    }
    launcherPfpUrl = pfpUrl;
  }

  // --- On-chain verification (finding A-02) ---
  const receipt = await fetchReceipt(txHash as `0x${string}`);
  if (!receipt) {
    return NextResponse.json({ error: "couldn't find that transaction on-chain" }, { status: 400 });
  }
  if (receipt.status !== 'success') {
    return NextResponse.json({ error: 'that transaction reverted — nothing launched' }, { status: 400 });
  }
  // The proof must come from the Clanker v4 factory itself, not a lookalike
  // contract emitting the same event shape.
  const factoryLogs = receipt.logs.filter(
    (log) => log.address.toLowerCase() === CLANKER_FACTORY.toLowerCase()
  );
  const created = parseEventLogs({
    abi: clankerTokenCreatedEventAbi,
    logs: factoryLogs,
  }).find((log) => log.args.tokenAddress.toLowerCase() === token.toLowerCase());
  if (!created) {
    return NextResponse.json(
      { error: 'no Clanker TokenCreated event for that token in that transaction' },
      { status: 400 }
    );
  }
  if (created.args.pairedToken.toLowerCase() !== HOODIE_ADDRESS.toLowerCase()) {
    return NextResponse.json({ error: 'that launch is NOT paired with $HOODIE' }, { status: 400 });
  }

  // Name/symbol come from the factory event — the on-chain truth — never the
  // POST body. Length-capped only so a hostile deploy can't bloat the record.
  const name = created.args.tokenName.slice(0, 64);
  const symbol = created.args.tokenSymbol.slice(0, 32);

  try {
    const launchers = await mutateRegistry((current) => {
      const launcher = current.find((l) => l.id === id);
      if (!launcher) throw new RegistryWriteRejected(404, `no launcher "${id}"`);
      if (launcher.launches.length >= MAX_LAUNCHES_PER_LAUNCHER) {
        throw new RegistryWriteRejected(403, 'this launcher is full — no more launch records');
      }
      if (launcher.launches.some((l) => l.token.toLowerCase() === token.toLowerCase())) {
        throw new RegistryWriteRejected(409, 'that launch is already on the board');
      }
      launcher.launches.push({
        name,
        symbol,
        token: token as `0x${string}`,
        txHash: txHash as `0x${string}`,
        mode: 'live',
        at: new Date().toISOString(),
        // The verified on-chain sender of the launch tx.
        launcherAddress: receipt.from,
        ...(launcherFid !== undefined && { launcherFid }),
        ...(launcherUsername !== undefined && { launcherUsername }),
        ...(launcherPfpUrl !== undefined && { launcherPfpUrl }),
      });
      return current;
    });
    const launcher = launchers.find((l) => l.id === id);
    return NextResponse.json(launcher, { status: 201 });
  } catch (e) {
    if (e instanceof RegistryWriteRejected) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
