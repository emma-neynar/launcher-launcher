/**
 * Best-effort Farcaster identity from the mini-app host, shared by the
 * create-launcher flow ("made by @…") and the launch flow ("launched by @…").
 *
 * Only resolvable inside a mini-app host; sdk.context can hang forever in a
 * plain browser, so (mirroring useIsInMiniApp in wallet.tsx) a top-level tab
 * bails synchronously and anything host-shaped is raced against a 2s timeout.
 * Failure is never an error — callers just fall back to an address.
 */
export type FarcasterIdentity = {
  fid?: number;
  username?: string;
  pfpUrl?: string;
};

export async function getFarcasterIdentity(): Promise<FarcasterIdentity> {
  if (
    window === window.parent &&
    !(window as { ReactNativeWebView?: unknown }).ReactNativeWebView
  ) {
    return {};
  }
  try {
    const { sdk } = await import('@farcaster/miniapp-sdk');
    const ctx = await Promise.race([
      sdk.context,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_000)),
    ]);
    const user = ctx?.user;
    if (!user || !Number.isInteger(user.fid) || user.fid <= 0) return {};
    return {
      fid: user.fid,
      ...(user.username && { username: user.username }),
      ...(user.pfpUrl && { pfpUrl: user.pfpUrl }),
    };
  } catch {
    return {};
  }
}
