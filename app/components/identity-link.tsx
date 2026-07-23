'use client';

/**
 * pfp + @username linking to farcaster, falling back to a shortened address —
 * the identity chip used by the launch form header (launcher creator), the
 * launch success card, and the token detail screen ("launched by" / "via").
 * `wrap` lets callers run the handle through a copy helper like
 * copy.home.creator ("by @…").
 */
export function IdentityLink({
  username,
  pfpUrl,
  fallbackAddress,
  wrap = (who) => who,
}: {
  username?: string;
  pfpUrl?: string;
  fallbackAddress?: string;
  wrap?: (who: string) => string;
}) {
  if (!username) {
    if (!fallbackAddress) return null;
    return (
      <span className="muted">
        {wrap(`${fallbackAddress.slice(0, 6)}…${fallbackAddress.slice(-4)}`)}
      </span>
    );
  }
  return (
    <a
      className="creator-link"
      href={`https://farcaster.xyz/${username}`}
      target="_blank"
      rel="noreferrer"
    >
      {pfpUrl && (
        // Plain <img>: pfpUrl is an arbitrary remote host, which next/image
        // would reject without a remotePatterns entry.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pfpUrl} alt="" width={20} height={20} className="creator-pfp" />
      )}
      {wrap(`@${username}`)}
    </a>
  );
}
