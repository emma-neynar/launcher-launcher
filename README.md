# Launcher Launcher

A **token-launcher-launcher** on **Robinhood Chain**, built on top of the deployed Clanker v4 protocol via the published [`clanker-sdk`](https://www.npmjs.com/package/clanker-sdk) npm package.

The joke, and the rule: **every token launched through any Launcher created here is force-paired with $HOODIE** (`0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3`, a Bankr token). No creator, launcher owner, or end user can change it.

## The two layers

1. **Launcher** (`launch` command) — deploys a token through the already-deployed Clanker v4 factory on Robinhood Chain (`0xD3f2cC1731b7Fd17f28798835C2E02f0a1839A94`). The pool's paired/quote token is locked to $HOODIE. The launcher's fee recipient automatically gets a share of LP fee rewards (default 20%), the token creator gets the rest.
2. **Launcher Launcher** (`create-launcher` command) — spins up a new Launcher (name, fee recipient, fee share, description) as easily as launching a token. Every Launcher it creates inherits the immutable $HOODIE rule. Created launchers and their launches live in a simple JSON registry (`registry/launchers.json`).

## The immutable $HOODIE rule

Enforced in depth, in `src/hoodie-lock.ts`:

1. `HOODIE_ADDRESS` is a frozen constant in `src/constants.ts`. Nothing in this repo reads a paired token from user input, env vars, config files, or the network.
2. `buildLockedTokenConfig()` is the only place a deploy config is constructed; it writes `pool.pairedToken` from the constant. If a caller passes a `--paired-token` that isn't $HOODIE, it throws `HoodiePairingViolation` before anything touches the network.
3. After the SDK encodes the raw `deployToken()` calldata, `assertHoodieInCalldata()` re-verifies the encoded `poolConfig.pairedToken` — so even a bug or tampered dependency between config and calldata gets caught.
4. Registry entries store `pairedToken` for display only; a tampered registry entry is refused at load time.
5. `verify --tx <hash>` decodes an on-chain deploy transaction's calldata against the factory ABI and proves the pairing after the fact.

No custom contracts were needed: the pairing is a parameter of Clanker's own `deployToken()` call, so locking the parameter at the only choke point (plus calldata verification) gives the guarantee without forking or redeploying anything.

## Safety posture

- Clanker is consumed **only** as the versioned npm dependency `clanker-sdk@^4.2.18`. Nothing in any Clanker repo, contract, indexer, database, bot, or frontend is touched.
- The only contract ever called is the already-deployed Clanker v4 factory on Robinhood Chain, through the SDK's normal public methods.
- **Robinhood Chain has no testnet in the SDK** (chain id 4663 is the only Robinhood entry, `testnet: false`), so the default path is a full **dry-run**: the SDK encodes real calldata, we verify it, and simulate the deploy via `eth_call` against the live RPC — nothing is ever broadcast.
- Mainnet execution requires the explicit `--live` flag **and** typing `LAUNCH` at an interactive confirmation, and a `PRIVATE_KEY` in `.env` (gitignored; use a fresh dev wallet with minimal funds).

## Quickstart

```bash
npm install
cp .env.example .env   # PRIVATE_KEY only needed for --live

# Layer 2: create a Launcher
npm run ll -- create-launcher --name "Hoodie Season" \
  --fee-recipient 0xYourDevWallet --description "all pairs lead to HOODIE"

# Layer 1: launch a token through it (DRY RUN — default)
npm run ll -- launch --launcher hoodie-season \
  --name "My Token" --symbol MTK --creator 0xYourDevWallet

# See registered launchers + their launches
npm run ll -- list

# Actually deploy (mainnet; gated behind flag + typed confirmation)
npm run ll -- launch --launcher hoodie-season \
  --name "My Token" --symbol MTK --creator 0xYourDevWallet --live

# Prove any deploy tx was $HOODIE-paired from its on-chain calldata
npm run ll -- verify --tx 0x<deploy tx hash>
```

A dry run prints the encoded factory call, the verified $HOODIE paired token, the reward split, the CREATE2-predicted token address, and the result of the `eth_call` simulation. Trying to sneak a different pair fails loudly:

```
$ npm run ll -- launch ... --paired-token 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73
Error: Paired token is locked to $HOODIE (0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3)
and cannot be overridden. Rejected attempt to pair with 0x0Bd7...AD73.
```

## Clanker SDK usage map

| SDK call | Type | Purpose here |
|---|---|---|
| `robinhood` (chain export) | read-only constant | viem chain config for Robinhood Chain (id 4663) |
| `POOL_POSITIONS.Standard` | read-only constant | default LP position shape |
| `clankerConfigFor(4663, 'clanker_v4')` | read-only lookup | factory address + ABI for `verify` |
| `new Clanker({ publicClient, wallet? })` (from `clanker-sdk/v4`) | client setup | — |
| `clanker.getDeployTransaction(token)` | pure encoding (no network) | build + inspect raw `deployToken()` args |
| `clanker.deploySimulate(token, account)` | read-only `eth_call` | dry-run against live factory, never broadcasts |
| `clanker.deploy(token)` | **write (mainnet tx)** | only behind `--live` + typed confirmation |

The paired token is set via the `ClankerTokenV4` config field `pool.pairedToken` (v4; the v3-era name was `pool.quoteToken`), which the SDK encodes into the factory's `poolConfig.pairedToken` calldata field.

## Bounty mapping

- Built on Clanker on Robinhood Chain, using only the public, published SDK against the already-deployed factory.
- $HOODIE pairing is structural, verified in calldata pre-send and provable on-chain post-send.
- "Launcher-launcher": creating a launcher is one command, launching through it is one more, and the rule survives both layers.
