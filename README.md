# Launcher Launcher

A **token-launcher-launcher** on **Robinhood Chain** (chain id 4663), built on the deployed Clanker v4 protocol. The joke, and the rule: **every token launched through any Launcher created here is force-paired with $HOODIE** (`0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3`, a Bankr token). No creator, launcher owner, or end user can change it — the rule is enforced **on-chain**.

Three pieces, one repo:

| Piece | Where | What it does |
|---|---|---|
| On-chain wrapper | `contracts/` (standalone Foundry project) | `LauncherLauncher` + `Launcher` contracts; the immutable $HOODIE rule lives here |
| Farcaster Mini App | `app/` (Next.js) | Users create launchers and launch tokens with **their own wallets** |
| CLI (original prototype) | `src/` | SDK-direct path; also the admin/deploy tooling with the gated `--live` key path |

## The two on-chain layers

**1. `LauncherLauncher`** (`contracts/src/LauncherLauncher.sol`) — deploys one canonical `Launcher` implementation in its constructor, then `createLauncher(name, feeRecipient, lpRewardBps)` hands out EIP-1167 minimal-proxy clones and keeps an on-chain registry (`allLaunchers()`, `launcherCount()`, `LauncherCreated` event). Creating a launcher is as easy as launching a token.

**2. `Launcher`** (`contracts/src/Launcher.sol`) — `launch(LaunchParams)` builds the Clanker v4 `deployToken()` call (selector `0xdf40224a`) and calls the **already-deployed** factory at `0xD3f2cC1731b7Fd17f28798835C2E02f0a1839A94`. The wrapper never deploys, upgrades, or administers any Clanker contract — it is strictly a caller. The launcher's `feeRecipient` gets `lpRewardBps` (max 50%) of LP fee rewards; the token creator gets the rest.

### Where the immutable rule is enforced

- `Launcher.HOODIE` is a **compile-time `constant`** — not storage, not an immutable set by a constructor arg, no setter, no initializer parameter.
- `Launcher.LaunchParams` **has no pairedToken field**: a direct caller of `launch()` cannot even express a different pair (reject-by-construction).
- Every clone delegatecalls the same implementation bytecode, so every launcher created by `LauncherLauncher` inherits the rule with no per-launcher escape hatch.
- Proof lives in the tests: `test_hoodieIsConstant_expectedAddress`, `test_everyCloneInheritsHoodie`, `test_noPairSetterExists`, `test_implementationIsBricked`, `test_cloneInitializesExactlyOnce` (`contracts/test/Immutability.t.sol`, no fork needed) and `test_fullFlow_tokenPairedWithHoodie`, `testFuzz_launch_alwaysPairsHoodie`, `test_customTick_stillHoodie` (`contracts/test/LauncherFork.t.sol`, run against a fork of the live factory — they decode the factory's own `TokenCreated` event and assert `pairedToken == HOODIE`).

## Fork testing (Robinhood has no testnet)

Robinhood Chain has no testnet in the Clanker SDK (4663 is mainnet-only), so everything runs against a **local Anvil fork** by default. Requires [Foundry](https://book.getfoundry.sh/getting-started/installation).

```bash
# Foundry test suite (unit + fork tests; fork tests hit the live RPC read-only)
npm run test:contracts

# One command, full proof: starts an Anvil fork, deploys LauncherLauncher,
# creates a launcher, launches a token, and decodes the factory's TokenCreated
# event from the fork to prove pairedToken == $HOODIE. Nothing touches mainnet.
npm run fork:demo
```

## The Mini App

Next.js app in `app/`, using `@farcaster/miniapp-sdk` (0.3.x) + `@farcaster/miniapp-wagmi-connector` (2.x) + wagmi 2.x. `sdk.actions.ready()` is called on mount (`app/providers.tsx`).

- **Flows:** create a launcher → browse the on-chain registry → launch a token through a selected launcher → post-launch proof panel + standalone "Verify" tab (paste any tx hash; it decodes the factory's `TokenCreated` event client-side).
- **Wallet:** users sign with their own wallet via the Mini App Ethereum provider (`farcasterMiniApp()` connector) or an injected wallet in a plain browser. Target chain is 4663 with a switch/add-chain prompt. **No server key anywhere in the app path.**
- **The pairing is not an editable field anywhere** — it renders as a locked banner (`app/components/locked-pair.tsx`).
- **Market cap → tick:** the launch form takes a target starting market cap denominated in $HOODIE and computes `tick = floor(log(mcap / 100e9) / log(1.0001) / 200) * 200` (both tokens are 18 decimals, so no decimal adjustment; USD denomination would need a $HOODIE price feed — deliberately out of scope). A manual tick override exists behind a warning; the SDK default `-230400` ≈ 10 $HOODIE.

### Run it against the fork

```bash
cp .env.example .env
npm install

# 1. fork + deploy the wrapper locally
anvil --fork-url https://rpc.mainnet.chain.robinhood.com &
cd contracts && forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 \
  --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 && cd ..

# 2. put the printed LauncherLauncher address into .env:
#    NEXT_PUBLIC_LAUNCHER_LAUNCHER_ADDRESS=0x...
#    NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545

# 3. run the app
npm run dev   # http://localhost:3000
```

### Manifest + embed

- `public/.well-known/farcaster.json` — the Mini App manifest (`miniapp.version/name/homeUrl/iconUrl` + store metadata). `requiredChains` is intentionally omitted: Farcaster's chain list doesn't include `eip155:4663`, so the app handles chain add/switch itself.
- The root layout and the shareable route `app/l/[launcherAddress]` emit the `fc:miniapp` (+ legacy `fc:frame`) meta tag, so casting a launcher URL renders a "Launch with $HOODIE" card.

## CLI (SDK-direct path, kept from v1)

```bash
npm run ll -- create-launcher --name "Hoodie Season" --fee-recipient 0x...   # JSON registry
npm run ll -- launch --launcher hoodie-season --name "My Token" --symbol MTK --creator 0x...  # dry-run default
npm run ll -- launch ... --live   # mainnet; requires PRIVATE_KEY + typing LAUNCH
npm run ll -- verify --tx 0x...  # decode any factory deploy tx's pairedToken
```

The CLI enforces the same rule in TypeScript (`src/hoodie-lock.ts`): hardcoded constant, override rejection, and calldata re-verification before simulate/send.

## Read-only vs write calls

| Call | Type |
|---|---|
| clanker-sdk: `robinhood`, `POOL_POSITIONS`, `clankerConfigFor`, `getDeployTransaction` | read-only / pure encoding |
| clanker-sdk: `deploySimulate` | read-only `eth_call` |
| clanker-sdk: `deploy` (CLI only) | **write** — gated behind `--live` + typed `LAUNCH` |
| Wrapper: `allLaunchers`, `launcherCount`, `HOODIE`, `tokens`, event decoding | read-only |
| Wrapper: `createLauncher`, `launch` | **write** — signed by the end user's own wallet (fork or mainnet) |
| `scripts/deploy-live.sh` (deploys the wrapper itself) | **write** — gated behind typed `DEPLOY` + dev-wallet key |
| Clanker factory `deployToken` | **write**, but only ever invoked *through* the wrapper/SDK paths above; the factory itself is never deployed/modified/administered |

## Safety posture (unchanged)

- Clanker consumed only as the versioned npm dependency `clanker-sdk@^4.2.18`; zero edits to `node_modules` or any Clanker repo; no interaction with Clanker core contracts except calling the public deployed factory; no writes to any Clanker production service.
- Secrets live in the gitignored `.env` (`.env.example` is committed); a fresh dev wallet with minimal funds for anything live; the mini app never sees a server key.
- All default paths are local/simulated (Anvil fork, `eth_call`). Mainnet actions are single, separate, explicitly-gated scripts with typed confirmations — never automatic.
- Docs note: pairing with arbitrary quote tokens is [explicitly permissionless at the factory](https://clanker.world/docs/references/supported-quote-tokens); the whitelist only constrains the @clanker bot/API.

## Go-live checklist (the remaining human steps)

1. **Deploy the wrapper to mainnet:** fund a fresh dev wallet with a little ETH on Robinhood Chain, put its key in `.env` as `PRIVATE_KEY`, then `npm run deploy:live` (asks you to type `DEPLOY`). Put the printed address in `.env` as `NEXT_PUBLIC_LAUNCHER_LAUNCHER_ADDRESS` and set `NEXT_PUBLIC_RPC_URL=https://rpc.mainnet.chain.robinhood.com`.
2. **Host the app** on a stable domain (the domain is the Mini App's permanent identity). Set `NEXT_PUBLIC_APP_URL=https://yourdomain`. Add a real 1024×1024 PNG at `public/icon.png` and a 3:2 (≥600×400) `public/embed-image.png`, and fill the real URLs into `public/.well-known/farcaster.json`.
3. **Sign the manifest:** open the Warpcast Mini App Manifest Tool (`https://farcaster.xyz/~/developers/mini-apps/manifest`), enter your domain, sign with the **Farcaster custody key of the owning account**, and replace the `_TODO_accountAssociation` key in `public/.well-known/farcaster.json` with the generated `accountAssociation` object. This cannot be faked or automated — only the account owner can produce it.
4. Cast the app URL (or any `/l/<launcher>` URL) — it renders as a launchable Mini App card.
