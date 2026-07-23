import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { loadRegistry, saveRegistry } from '@/src/registry';

export const dynamic = 'force-dynamic';

/** Record a completed (user-signed) launch against a launcher. Display-only data. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim() : '';
  const token = typeof body.token === 'string' ? body.token : '';
  const txHash = typeof body.txHash === 'string' ? body.txHash : undefined;
  if (!name || !symbol || !isAddress(token)) {
    return NextResponse.json({ error: 'name, symbol and a valid token address are required' }, { status: 400 });
  }

  // Optional Farcaster identity of the launching user (present only when the
  // launch came from the mini app) — same rules as the launcher creator
  // fields in app/api/launchers/route.ts.
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

  const launchers = await loadRegistry();
  const launcher = launchers.find((l) => l.id === id);
  if (!launcher) return NextResponse.json({ error: `no launcher "${id}"` }, { status: 404 });

  launcher.launches.push({
    name,
    symbol,
    token: token as `0x${string}`,
    txHash: txHash as `0x${string}` | undefined,
    mode: 'live',
    at: new Date().toISOString(),
    ...(launcherFid !== undefined && { launcherFid }),
    ...(launcherUsername !== undefined && { launcherUsername }),
    ...(launcherPfpUrl !== undefined && { launcherPfpUrl }),
  });
  await saveRegistry(launchers);

  return NextResponse.json(launcher, { status: 201 });
}
