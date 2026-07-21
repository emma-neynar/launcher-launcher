import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOODIE_ADDRESS } from './constants.js';

export type Launcher = {
  id: string;
  name: string;
  /** Address that administers/receives the launcher's share of LP fee rewards. */
  feeRecipient: `0x${string}`;
  /** Bps of the reward split routed to feeRecipient (remainder goes to the token creator). */
  feeShareBps: number;
  description?: string;
  /** Always HOODIE_ADDRESS. Stored for display; never read as an input to a deploy. */
  pairedToken: typeof HOODIE_ADDRESS;
  createdAt: string;
  /** Tokens launched through this launcher. */
  launches: {
    name: string;
    symbol: string;
    token: `0x${string}`;
    txHash?: `0x${string}`;
    mode: 'dry-run' | 'live';
    at: string;
  }[];
};

const REGISTRY_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'registry',
  'launchers.json'
);

export function loadRegistry(): Launcher[] {
  if (!existsSync(REGISTRY_PATH)) return [];
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as Launcher[];
}

export function saveRegistry(launchers: Launcher[]): void {
  mkdirSync(dirname(REGISTRY_PATH), { recursive: true });
  writeFileSync(REGISTRY_PATH, `${JSON.stringify(launchers, null, 2)}\n`);
}

export function getLauncher(id: string): Launcher {
  const launcher = loadRegistry().find((l) => l.id === id || l.name === id);
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
