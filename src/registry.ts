import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { HOODIE_ADDRESS } from './hoodie';

export type Launcher = {
  id: string;
  name: string;
  /** Address that administers/receives the launcher's share of LP fee rewards. */
  feeRecipient: `0x${string}`;
  /**
   * The ONE user-set launcher parameter: bps of the (post-protocol) reward
   * pool routed to feeRecipient; the remainder goes to the token creator.
   * Validated to 0–8000 (see src/fees.ts). Gross-of-protocol-fee display
   * percentages are derived from this via grossFeeSplit().
   */
  lpRewardBps: number;
  description?: string;
  /**
   * Farcaster identity of whoever created the launcher, captured from the
   * mini-app sdk.context at creation time. All optional: entries created
   * before this existed (or from the CLI / plain web) simply lack them.
   */
  creatorFid?: number;
  creatorUsername?: string;
  creatorPfpUrl?: string;
  /** Always HOODIE_ADDRESS. Stored for display; never read as an input to a deploy. */
  pairedToken: typeof HOODIE_ADDRESS;
  createdAt: string;
  /** Tokens launched through this launcher. */
  launches: Launch[];
};

export type Launch = {
  name: string;
  symbol: string;
  token: `0x${string}`;
  txHash?: `0x${string}`;
  mode: 'dry-run' | 'live';
  at: string;
  /**
   * Farcaster identity of whoever launched the token, captured from the
   * mini-app sdk.context at launch time. All optional: launches recorded
   * before this existed (or from the CLI / plain web) simply lack them.
   */
  launcherFid?: number;
  launcherUsername?: string;
  launcherPfpUrl?: string;
};

// ---------------------------------------------------------------------------
// Storage backends. The registry is tiny (a list of saved configs — never
// funds), so the whole thing lives under ONE value and read-modify-write is
// fine. Two interchangeable backends behind the same async interface:
//
//   1. JSON file (default)  — registry/launchers.json; local dev, the CLI,
//      and any host with a persistent disk.
//   2. Vercel KV / Upstash Redis — selected automatically when REST creds are
//      present in the environment. Vercel KV is Upstash under the hood; both
//      env-var conventions are accepted (KV_REST_API_* is what a Vercel KV /
//      Marketplace Upstash integration injects, UPSTASH_REDIS_REST_* is what
//      Upstash's own dashboard shows — same credentials either way).
//
// Required on Vercel: serverless filesystems are ephemeral/read-only, so the
// JSON file cannot persist there.
// ---------------------------------------------------------------------------

type RegistryStore = {
  load(): Promise<Launcher[]>;
  save(launchers: Launcher[]): Promise<void>;
};

// process.cwd() is the repo root for both the CLI (npm run ll) and the Next.js
// server (API routes) — one shared JSON registry for every surface.
const REGISTRY_PATH = join(process.cwd(), 'registry', 'launchers.json');

const fileStore: RegistryStore = {
  async load() {
    if (!existsSync(REGISTRY_PATH)) return [];
    return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as Launcher[];
  },
  async save(launchers) {
    mkdirSync(dirname(REGISTRY_PATH), { recursive: true });
    writeFileSync(REGISTRY_PATH, `${JSON.stringify(launchers, null, 2)}\n`);
  },
};

const KV_KEY = 'launcher-launcher:registry';

function kvCredentials(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

function kvStore(creds: { url: string; token: string }): RegistryStore {
  // Lazy import so the JSON-file default (local dev, CLI) never touches the
  // Redis client. @upstash/redis is REST-based: fetch only, serverless-safe.
  const redis = import('@upstash/redis').then(({ Redis }) => new Redis(creds));
  return {
    async load() {
      // The client JSON-(de)serializes values transparently.
      return (await (await redis).get<Launcher[]>(KV_KEY)) ?? [];
    },
    async save(launchers) {
      await (await redis).set(KV_KEY, launchers);
    },
  };
}

let store: RegistryStore | undefined;
function getStore(): RegistryStore {
  if (!store) {
    const creds = kvCredentials();
    store = creds ? kvStore(creds) : fileStore;
  }
  return store;
}

export async function loadRegistry(): Promise<Launcher[]> {
  return getStore().load();
}

export async function saveRegistry(launchers: Launcher[]): Promise<void> {
  await getStore().save(launchers);
}

export async function getLauncher(id: string): Promise<Launcher> {
  const launcher = (await loadRegistry()).find((l) => l.id === id || l.name === id);
  if (!launcher) {
    throw new Error(`No launcher "${id}". Run \`npm run ll -- list\` to see registered launchers.`);
  }
  if (launcher.pairedToken.toLowerCase() !== HOODIE_ADDRESS.toLowerCase()) {
    throw new Error(
      `Registry entry "${launcher.name}" has a tampered pairedToken (${launcher.pairedToken}). Refusing to use it.`
    );
  }
  return launcher;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
