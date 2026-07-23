import { kvCredentials } from './registry';

/**
 * Tiny per-IP rate limiter for the two registry write routes (finding A-04).
 * Fixed one-minute windows counted in Upstash Redis — the store the deployed
 * registry already uses, and the only kind of counter that works across
 * serverless invocations. Without Redis creds (local dev, file backend) it
 * allows everything; on Redis errors it fails open, since the registry is
 * display data and availability beats strictness here.
 */

const WINDOW_SECONDS = 60;
const MAX_WRITES_PER_WINDOW = 10;

type RedisLike = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
};

let redisPromise: Promise<RedisLike> | null | undefined;

function getRedis(): Promise<RedisLike> | null {
  if (redisPromise === undefined) {
    const creds = kvCredentials();
    redisPromise = creds
      ? import('@upstash/redis').then(({ Redis }) => new Redis(creds))
      : null;
  }
  return redisPromise;
}

/** True when this write should be allowed. `scope` separates the two routes. */
export async function allowWrite(scope: string, ip: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  try {
    const bucket = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
    const key = `launcher-launcher:ratelimit:${scope}:${ip}:${bucket}`;
    const count = await (await redis).incr(key);
    if (count === 1) await (await redis).expire(key, WINDOW_SECONDS * 2);
    return count <= MAX_WRITES_PER_WINDOW;
  } catch {
    return true;
  }
}

/** Best-effort client IP for rate limiting (Vercel sets x-forwarded-for). */
export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || 'unknown';
}
