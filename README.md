# Launcher Launcher

A **token-launcher-launcher** on **Robinhood Chain** (chain id 4663), built on the deployed Clanker v4 protocol. The joke, and the rule: **every token launched through any Launcher created here is force-paired with $HOODIE** (`0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3`, a Bankr token).

Three pieces, one repo:

| Piece | Where | What it does |
|---|---|---|
| Farcaster Mini App | `app/` (Next.js) | **The shipped product.** Users create launchers and launch tokens with **their own wallets** via direct Clanker v4 factory calls |
| CLI | `src/` | Same SDK-direct path from the terminal; also the `expected-position` emitter and gated `--live` tooling |
| On-chain wrapper (OPTIONAL trustless mode) | `contracts/` (standalone Foundry project) | `LauncherLauncher` + `Launcher` contracts that enforce the rule in bytecode; **not required to ship** |

## The primary shipped path: off-chain enforcement

The mini app launches tokens with **direct Clanker v4 factory `deployToken()` calls, encoded by `clanker-sdk` and signed by the user's own wallet**. No intermediary contract, no server key, no funded deploy needed to go live.

The $HOODIE pairing is forced at one choke point, used by both the app and the CLI (`src/hoodie-lock.ts`):

1. **`buildLockedTokenConfig()`** — the only place in the repo that constructs a deploy config. `pool.pairedToken` is written from the frozen constant, never from input; a `requestedPairedToken` field exists purely so hostile input has somewhere to land, and anything that isn't $HOODIE throws `HoodiePairingViolation`.
2. **`assertHoodieInCalldata()`** — after the SDK encodes the raw `deployToken()` args, the **encoded calldata** is re-verified to contain exactly $HOODIE before the user's wallet is ever asked to sign (defense in depth).
3. **Post-launch proof** — the app decodes the factory's own `TokenCreated` event from the receipt and shows the pairing on screen; the standalone Verify view does the same for any tx hash.

This is "enforced in the interface + verifiable on-chain," not "enforced by bytecode." For the bytecode version, see [Optional trustless mode](#optional-trustless-mode-the-on-chain-wrapper) below.

### Launcher persistence (the stated choice)

**Chosen: a small backend — the lightest option.** A "launcher" in the off-chain model is just a saved config (`name`, `feeRecipient`, `lpRewardBps`) that gets baked into the deploy's `rewardRecipients`/`rewardBps` at launch time. It lives behind two Next.js route handlers (`app/api/launchers`), shared with the CLI. Nothing in this store ever holds or routes funds, so there is no audit surface.

**Storage: one async interface, two backends** (`src/registry.ts`, the only module that touches storage — CLI and API routes share it):

- **JSON file** (`registry/launchers.json`) — the default. Local dev, the CLI, and any host with a persistent disk.
- **Upstash Redis (via the Vercel Marketplace)** — selected automatically when REST credentials are present in the environment. The host is **Vercel**, whose serverless filesystem is ephemeral, so the production deployment at [yodawg-launcher.vercel.app](https://yodawg-launcher.vercel.app) uses a Marketplace-connected Upstash Redis database. Both env-var conventions work: `KV_REST_API_URL`/`KV_REST_API_TOKEN` (what the Vercel integration injects) or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (what the Upstash dashboard shows) — same credentials. The whole registry is one tiny JSON value under one key; read-modify-write is fine at this scale.

The heavier alternative — a minimal registry-ONLY contract (same three fields, still no fund handling) — was deliberately **not** picked for the base submission because it would reintroduce a funded mainnet deploy; it remains a straightforward swap later since every consumer goes through the same registry module.

### One config knob

Launcher creation exposes **exactly one user-set parameter**: `lpRewardBps` — the launcher operator's cut of the (post-protocol) reward pool. Validated to **0–8000**, default **2000** (20%), in `src/fees.ts`. Everything else is forced: the $HOODIE pair, the standard token config, the canonical opening tick, and the fee recipient (the wallet that creates the launcher).

### Fee display: always the TRUE (gross) split

Everywhere fees appear, the app shows **gross-of-LP-fee percentages** computed live from `lpRewardBps` (`grossFeeSplit()` in `src/fees.ts`):

| Party | Share of ALL LP fees | Default (`lpRewardBps` = 2000) |
|---|---|---|
| Clanker protocol | 20% — fixed, always an explicit line item | 20% |
| Token creator | 80% × (1 − lpRewardBps/10000) | 64% |
| Launcher operator | 80% × (lpRewardBps/10000) | 16% |

The 80/20 recipient shares configured in `rewards.recipients` are shares of the **post-protocol** pool and are never presented as what a user earns. The 20% lives in one labeled constant (`CLANKER_PROTOCOL_FEE_BPS`, "Clanker documented protocol fee") so a protocol-side change is a one-line update.

### The canonical opening tick

Every launch opens at **one fixed tick**: `CANONICAL_OPENING_TICK = -27400` (`src/tick.ts`). Derivation: the standard ~$30k Clanker opening market cap at $HOODIE's live price — **price source: Dexscreener's public API reading the HOODIE/WETH Uniswap v4 pool on Robinhood Chain** (`src/hoodie-price.ts`; also stated in the UI). Calibrated 2026-07-21 at $HOODIE ≈ $4.56e-6 → ≈ 6.6B $HOODIE ≈ $30k. The tick is fixed at build time; the live price is only used to display the USD equivalent.

Why fixed: clanker.world needs a single (pairedToken + tick) config to add to its "expected positions" so these launches don't get flagged as unusual. There is no market-cap or tick input in the app; the CLI keeps an advanced `--tick` override that warns it deviates from the whitelisted tick.

### Emit the expected-position config

Print the exact position config for the Clanker side to whitelist (it encodes a real `deployToken()` transaction read-only, so the hook address and pool params are exactly what the app sends):

```bash
npm run expected-position
```

Output includes: `pairedToken` = $HOODIE (`0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3`), opening tick `-27400`, tick spacing 200, the single position (`tickLower -27400`, `tickUpper 83000`, `positionBps 10000`), the static pool fee (100 bps each side), the hook and locker addresses, and the raw `poolData`.

### Open TODOs (pending dev answers)

- **Fixed tick vs a range** for clanker.world's expected positions. Shipping the fixed default; `CANONICAL_OPENING_TICK` is the one constant every consumer reads, so widening to a range later is a local change. (`src/tick.ts`)
- **Exact pool fee bps** we deploy with. Named constant `POOL_FEE_BPS` (currently 100 = 1% each side) in `src/fees.ts`; affects absolute fee revenue, never the split percentages.

## Optional trustless mode: the on-chain wrapper

Kept in the repo, fully tested, **not on the go-live path**. Deploying it is only needed if you want the pairing rule enforced by bytecode instead of at the app/CLI choke point.

**1. `LauncherLauncher`** (`contracts/src/LauncherLauncher.sol`) — deploys one canonical `Launcher` implementation in its constructor, then `createLauncher(name, feeRecipient, lpRewardBps)` hands out EIP-1167 minimal-proxy clones and keeps an on-chain registry (`allLaunchers()`, `launcherCount()`, `LauncherCreated` event).

**2. `Launcher`** (`contracts/src/Launcher.sol`) — `launch(LaunchParams)` builds the Clanker v4 `deployToken()` call (selector `0xdf40224a`) and calls the **already-deployed** factory at `0xD3f2cC1731b7Fd17f28798835C2E02f0a1839A94`. The wrapper never deploys, upgrades, or administers any Clanker contract — it is strictly a caller. Note: the wrapper caps `lpRewardBps` at 5000 (50%); the off-chain model allows up to 8000. The wrapper's fee mechanics are confirmed correct and unchanged.

Where the immutable rule is enforced on-chain: `Launcher.HOODIE` is a compile-time `constant` (no storage, no setter, no initializer parameter); `LaunchParams` has no pairedToken field (reject-by-construction); every clone delegatecalls the same implementation bytecode. Proof lives in `contracts/test/Immutability.t.sol` (no fork needed), `contracts/test/LauncherFork.t.sol` (against a fork of the live factory — they decode the factory's own `TokenCreated` event and assert `pairedToken == HOODIE`), and `contracts/test/FeePath.t.sol` (real swap volume on the fork, then assert the fee recipient actually receives its configured LP-fee split as ERC20).

### Fee semantics (resolved from the factory ABI, not assumed)

When anything calls `deployToken()` — the user's wallet directly (primary path) or the wrapper (trustless mode) — **nothing accrues to `msg.sender`**. The factory takes explicit parameters:

- **Creator/admin** = `tokenConfig.tokenAdmin` — always the user's address; the user owns the token admin role.
- **LP fee rewards** = `lockerConfig.rewardRecipients[]` + `rewardBps[]` — `[creator, feeRecipient]` with `[10000 - lpRewardBps, lpRewardBps]` written directly into the locker's on-chain reward table at deploy time.

The payout pipeline is entirely Clanker's own periphery: fees accrue in the Uniswap v4 position → anyone calls `ClankerLpLockerFeeConversion.collectRewards(token)` (`0x290F…5Bc99`), which splits by `rewardBps` and stores per-recipient balances in the `ClankerFeeLocker` (`0x88db…d70c`) → each recipient withdraws with `claim(recipient, token)` (permissionless to trigger, always pays the recipient). Proven end-to-end in `contracts/test/FeePath.t.sol` on a mainnet fork.

## Fork testing (Robinhood has no testnet)

Robinhood Chain has no testnet in the Clanker SDK (4663 is mainnet-only), so everything runs against a **local Anvil fork** by default. Requires [Foundry](https://book.getfoundry.sh/getting-started/installation) (only for the optional contract tests / trustless mode).

```bash
# Optional trustless mode proofs:
npm run test:contracts   # 14 Foundry tests: immutability + pairing + fee path (fork)
npm run fork:demo        # Anvil fork -> deploy wrapper -> createLauncher -> launch
                         # -> decode factory TokenCreated -> PROVEN paired with $HOODIE
```

## The Mini App

Next.js app in `app/`, using `@farcaster/miniapp-sdk` (pinned 0.3.0) + `@farcaster/miniapp-wagmi-connector` (pinned 2.0.0) + wagmi 2.x. `sdk.actions.ready()` is called on mount, guarded by `sdk.isInMiniApp()` (`app/providers.tsx`).

- **Flows:** create a launcher (a saved registry config — free, no transaction) → browse the registry → launch a token through a selected launcher (direct factory call, user-signed) → post-launch proof panel + standalone "Verify" view (paste any tx hash; it decodes the factory's `TokenCreated` event client-side).
- **Wallet:** users sign with their own wallet via the Mini App Ethereum provider (`farcasterMiniApp()` connector) or an injected wallet in a plain browser. Target chain is 4663 with a switch/add-chain prompt. **No server key anywhere in the app path.**
- **KNOWN LIMITATION — the Farcaster in-app wallet cannot reach Robinhood Chain.** Verified against the `@farcaster/miniapp-wagmi-connector` source and [farcasterxyz/miniapps#240](https://github.com/farcasterxyz/miniapps/discussions/240): the host wallet supports `wallet_switchEthereumChain` but **not** `wallet_addEthereumChain`, and its built-in chain list does not include 4663. The app detects this at runtime via `sdk.getChains()` and shows an explicit limitation banner instead of a broken switch button. Injected wallets (MetaMask, Rabby, …) work — wagmi falls back to `wallet_addEthereumChain` with the chain metadata from `app/lib/wagmi.ts`.
- **The pairing is not an editable field anywhere** — it renders as a locked banner (`app/components/locked-pair.tsx`).
- **The opening market cap is not an editable field either** — the fixed canonical tick renders as a locked line with its live USD equivalent and the price source (Dexscreener) stated. See [The canonical opening tick](#the-canonical-opening-tick).
- **Fees are always itemized gross** — see [Fee display](#fee-display-always-the-true-gross-split); the shared component is `app/components/fee-split.tsx`.

### Run it locally

Verified from a clean checkout: `npm install`, `npx tsc --noEmit`, `npm run build` pass with no contract tooling required. Prereqs: Node 20+.

```bash
git clone <this repo> && cd launcher-launcher
cp .env.example .env
npm install
npm run dev   # http://localhost:3000
```

Point `NEXT_PUBLIC_RPC_URL` at the mainnet RPC (`https://rpc.mainnet.chain.robinhood.com`) or a local Anvil fork of it — launches are user-signed either way.

### Wallet connectors

Connector order in `app/lib/wagmi.ts` makes an **external wallet the primary signing path** (the Farcaster host wallet cannot reach chain 4663 — see the known limitation above):

1. `injected()` — MetaMask/Rabby/etc.; wagmi auto-adds Robinhood Chain via `wallet_addEthereumChain`.
2. `walletConnect(...)` — enabled when `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set (free id from [cloud.reown.com](https://cloud.reown.com)); recommended for mobile.
3. `farcasterMiniApp()` — kept for identity/context inside Farcaster clients; the app detects the missing chain via `sdk.getChains()` and shows a friendly "open in a browser with an external wallet" banner instead of a dead switch button.

### Manifest + embed

- The Mini App manifest is served **dynamically** by `app/.well-known/farcaster.json/route.ts` (the app-router convention for dotted paths — there is no static file to hand-edit). Every URL in it derives from `NEXT_PUBLIC_APP_URL`; the signed `accountAssociation` is read from the `FARCASTER_ACCOUNT_ASSOCIATION` env var and **omitted entirely when unset** (it cannot be faked — see the go-live checklist). `requiredChains` is intentionally omitted: Farcaster's chain list doesn't include `eip155:4663`, so the app handles chain add/switch itself.
- The root layout and the shareable route `app/l/[id]` emit the `fc:miniapp` (+ legacy `fc:frame`) meta tag, so casting a launcher URL renders a launchable card. These embeds, share links, and all image URLs also derive from `NEXT_PUBLIC_APP_URL` — set it to the permanent domain and every absolute URL follows.

### Works as a plain web app too

One codebase, two surfaces: the same app runs standalone in any normal browser, no Farcaster client required. `sdk.actions.ready()` only fires after `sdk.isInMiniApp()` confirms a Farcaster host (`app/providers.tsx`); outside one, the SDK is never engaged. Wallet-wise the browser is actually the **primary** surface — connector order is `injected()` first, then WalletConnect, with `farcasterMiniApp()` last (see [Wallet connectors](#wallet-connectors)), and the Farcaster-host chain detection only activates when the Farcaster connector is the one connected.

## CLI (same SDK-direct path, from the terminal)

```bash
npm run ll -- create-launcher --name "Hoodie Season" --fee-recipient 0x...   # one knob: --lp-reward-bps (default 2000)
npm run ll -- launch --launcher hoodie-season --name "My Token" --symbol MTK --creator 0x...  # dry-run default
npm run ll -- launch ... --live   # mainnet; requires PRIVATE_KEY + typing LAUNCH
npm run ll -- verify --tx 0x...   # decode any factory deploy tx's pairedToken
npm run expected-position         # print the clanker.world whitelist config
```

The CLI enforces the rule at the same choke point (`src/hoodie-lock.ts`): hardcoded constant, override rejection, and calldata re-verification before simulate/send.

## Read-only vs write calls

| Call | Type |
|---|---|
| clanker-sdk: `robinhood`, `clankerConfigFor`, `getDeployTransaction` | read-only / pure encoding |
| clanker-sdk: `deploySimulate` | read-only `eth_call` |
| Registry API (`app/api/launchers`) | registry store only (JSON file or Upstash Redis) — nothing on-chain, no funds |
| Clanker factory `deployToken` (mini app) | **write** — signed by the end user's own wallet |
| Clanker factory `deployToken` (CLI) | **write** — gated behind `--live` + typed `LAUNCH` |
| Optional wrapper: `allLaunchers`, `launcherCount`, `HOODIE`, `tokens`, event decoding | read-only |
| Optional wrapper: `createLauncher`, `launch` | **write** — trustless mode only, user-signed |
| `scripts/deploy-live.sh` (deploys the optional wrapper) | **write** — trustless mode only, gated behind typed `DEPLOY` + dev-wallet key |

## Safety posture (unchanged)

- Clanker consumed only as the versioned npm dependency `clanker-sdk@^4.2.18`; zero edits to `node_modules` or any Clanker repo; no interaction with Clanker core contracts except calling the public deployed factory; no writes to any Clanker production service.
- Secrets live in the gitignored `.env` (`.env.example` is committed); a fresh dev wallet with minimal funds for anything live; the mini app never sees a server key.
- All default paths are local/simulated (Anvil fork, `eth_call`, dry-run CLI). Mainnet actions are single, separate, explicitly-gated steps — the mini app's only write is the user signing their own launch; CLI/scripts require typed confirmations — never automatic.
- Docs note: pairing with arbitrary quote tokens is [explicitly permissionless at the factory](https://clanker.world/docs/references/supported-quote-tokens); the whitelist only constrains the @clanker bot/API. `npm run expected-position` emits the config to get these launches recognized.

## Go-live checklist (what shipped, what's left)

**No funded contract deploy was required.** The base submission is the mini app + registry backend — and it is live.

**Shipped stack: Vercel (host) + Upstash Redis via the Vercel Marketplace (registry) + the plain `*.vercel.app` domain.** Production: **<https://yodawg-launcher.vercel.app>** — Vercel project `yodawg-launcher` on the emma-neynars-projects team, deployed initially via the Vercel MCP plugin and now linked to the GitHub repo (`emma-neynar/launcher-launcher`), so **pushes to `main` auto-deploy**. The clanker.world-subdomain plan was dropped in favor of the plain vercel.app domain: the signed `accountAssociation` binds the app's identity to one exact permanent domain, and `yodawg-launcher.vercel.app` is that domain.

Already done:

- **Hosting + git deploys** — project created, first production deployment shipped, repo connected with push-to-main auto-deploys.
- **Registry persistence** — Upstash Redis ("upstash-kv-orange-basket") connected through the Vercel Marketplace; the injected `KV_REST_API_*` env vars flip the registry from the JSON file to Redis automatically. Verified with a live persistence probe: a launcher POSTed to `/api/launchers` survives a redeploy.
- **Env vars (Production)** — `NEXT_PUBLIC_APP_URL=https://yodawg-launcher.vercel.app`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, and `FARCASTER_ACCOUNT_ASSOCIATION` (signed by the clanker account, fid 874542, for exactly this domain), plus the injected KV vars.
- **Manifest** — served dynamically at `/.well-known/farcaster.json`, passes the Farcaster validator (subtitle ≤ 30 chars, description ≤ 170, no special characters — hence the $-less "HOODIE" wording in the manifest copy), `accountAssociation` live.

What's left:

1. **Mainnet smoke test (real gas, human-gated):** create a launcher in the UI, launch a token with a real wallet, and confirm the post-launch proof panel and `npm run ll -- verify --tx 0x…` both show the $HOODIE pairing.
2. **Send the whitelist request:** run `npm run expected-position` and hand the output to the Clanker side so clanker.world adds the (pairedToken + tick) config to its expected positions.
3. **Cast the app URL** (or any `/l/<launcher-id>` URL) — it renders as a launchable Mini App card.
4. *(Optional, trustless mode)* Deploy the on-chain wrapper later with `npm run deploy:live` (typed `DEPLOY`, fresh dev wallet) — not needed for the base submission.
