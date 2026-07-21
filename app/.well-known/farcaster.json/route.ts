import { NextResponse } from 'next/server';

/**
 * Farcaster Mini App manifest, generated from NEXT_PUBLIC_APP_URL so the
 * domain is never hand-edited into a static file. Served at
 * /.well-known/farcaster.json (route segment literally named that — the
 * app-router convention for dotted paths).
 *
 * FARCASTER_ACCOUNT_ASSOCIATION is the signed {header,payload,signature}
 * object from the Farcaster manifest tool
 * (https://farcaster.xyz/~/developers/mini-apps/manifest), produced by the
 * owning account's custody key FOR THE EXACT SERVING DOMAIN. It is included
 * only when set; there is no placeholder because it cannot be faked.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');

  let accountAssociation: { header: string; payload: string; signature: string } | undefined;
  const raw = process.env.FARCASTER_ACCOUNT_ASSOCIATION;
  if (raw) {
    try {
      accountAssociation = JSON.parse(raw);
    } catch {
      console.error('FARCASTER_ACCOUNT_ASSOCIATION is not valid JSON; omitting it from the manifest.');
    }
  }

  return NextResponse.json({
    ...(accountAssociation ? { accountAssociation } : {}),
    miniapp: {
      version: '1',
      name: 'YO DAWG',
      homeUrl: appUrl,
      iconUrl: `${appUrl}/icon.png`,
      splashImageUrl: `${appUrl}/splash.png`,
      splashBackgroundColor: '#8a63d2',
      subtitle: 'put a launcher in your launcher',
      description:
        'yo dawg, i heard you like launchers. spin up your own token launcher on Robinhood Chain — every token it launches pairs with $HOODIE, locked at the contract level. house rule. only rule.',
      primaryCategory: 'finance',
      tags: ['clanker', 'robinhood', 'hoodie', 'tokens', 'launcher'],
      ogTitle: 'YO DAWG — launcher launcher',
      ogDescription: 'put a launcher launcher in your launcher. every pair is $HOODIE, proven on-chain.',
      ogImageUrl: `${appUrl}/embed-image.png`,
    },
  });
}
