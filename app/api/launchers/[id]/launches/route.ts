import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { loadRegistry, saveRegistry } from '@/src/registry';

export const dynamic = 'force-dynamic';

/** Record a completed (user-signed) launch against a launcher. Display-only data. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { name?: unknown; symbol?: unknown; token?: unknown; txHash?: unknown };
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
  });
  await saveRegistry(launchers);

  return NextResponse.json(launcher, { status: 201 });
}
