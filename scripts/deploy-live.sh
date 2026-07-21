#!/usr/bin/env bash
# EXPLICITLY-GATED mainnet deploy of the LauncherLauncher wrapper to Robinhood
# Chain. Requires a funded dev wallet key in .env (PRIVATE_KEY) and a typed
# confirmation. This deploys ONLY our wrapper contracts; it does not deploy or
# modify anything of Clanker's.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="$HOME/.foundry/bin:$PATH"
[ -f .env ] && set -a && source .env && set +a
RPC="${ROBINHOOD_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"

if [ -z "${PRIVATE_KEY:-}" ]; then
  echo "PRIVATE_KEY missing from .env — use a fresh, dedicated dev wallet." >&2
  exit 1
fi

DEPLOYER=$(cast wallet address --private-key "$PRIVATE_KEY")
echo "About to deploy LauncherLauncher to Robinhood Chain MAINNET (chain 4663)."
echo "Deployer: $DEPLOYER"
echo "RPC:      $RPC"
printf 'Type DEPLOY to continue, anything else aborts: '
read -r ANSWER
if [ "$ANSWER" != "DEPLOY" ]; then
  echo "Aborted. Nothing was sent."
  exit 1
fi

(cd contracts && forge script script/Deploy.s.sol \
  --rpc-url "$RPC" --broadcast --private-key "$PRIVATE_KEY" -vv)

echo "Done. Put the LauncherLauncher address into .env as NEXT_PUBLIC_LAUNCHER_LAUNCHER_ADDRESS."
