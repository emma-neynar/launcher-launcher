#!/usr/bin/env bash
# One-command fork demo: Anvil-fork Robinhood Chain, deploy LauncherLauncher,
# create a launcher, launch a token through it, and PROVE on-chain that the
# token's pool pair is $HOODIE by decoding the Clanker factory's TokenCreated
# event from the local fork. Nothing touches mainnet.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="$HOME/.foundry/bin:$PATH"
RPC="${ROBINHOOD_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
PORT="${ANVIL_PORT:-8545}"
LOCAL="http://127.0.0.1:${PORT}"
HOODIE="0xc72c01aab5f5678dc1d6f5c6d2b417d91d402ba3"
FACTORY="0xD3f2cC1731b7Fd17f28798835C2E02f0a1839A94"
# Anvil's well-known dev key #0 — LOCAL FORK ONLY, never a real wallet.
DEV_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

echo "==> Starting Anvil fork of Robinhood Chain (${RPC})"
anvil --fork-url "$RPC" --port "$PORT" --silent &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do
  cast chain-id --rpc-url "$LOCAL" >/dev/null 2>&1 && break
  sleep 0.5
done
CHAIN_ID=$(cast chain-id --rpc-url "$LOCAL")
echo "==> Fork ready (chain id ${CHAIN_ID})"

echo "==> Running demo flow: deploy wrapper -> createLauncher -> launch token"
(cd contracts && forge script script/DemoFlow.s.sol \
  --rpc-url "$LOCAL" --broadcast --private-key "$DEV_KEY" -vv)

echo "==> Verifying on-chain: decoding the factory's TokenCreated event from the launch receipt"
TOPIC0=$(cast keccak "TokenCreated(address,address,address,string,string,string,string,string,int24,address,bytes32,address,address,address,uint256,address[])")
LAUNCH_TX=$(python3 -c "
import json
run = json.load(open('contracts/broadcast/DemoFlow.s.sol/${CHAIN_ID}/run-latest.json'))
print(run['transactions'][-1]['hash'])")
echo "    launch tx: $LAUNCH_TX"

RECEIPT_FILE=$(mktemp)
# Retry: the receipt can land a beat after broadcast returns on a fresh fork.
for i in $(seq 1 10); do
  if cast receipt "$LAUNCH_TX" --rpc-url "$LOCAL" --json > "$RECEIPT_FILE" 2>/dev/null \
     && python3 -c "import json,sys; sys.exit(0 if json.load(open('$RECEIPT_FILE')).get('logs') else 1)"; then
    break
  fi
  sleep 1
done
python3 - "$HOODIE" "$FACTORY" "$TOPIC0" "$RECEIPT_FILE" <<'PY'
import json, sys
hoodie, factory, topic0 = (a.lower() for a in sys.argv[1:4])
receipt = json.load(open(sys.argv[4]))
logs = [l for l in receipt["logs"] if l["address"].lower() == factory and l["topics"][0].lower() == topic0]
if not logs:
    print("FAIL: no TokenCreated event in the launch receipt"); sys.exit(1)
log = logs[-1]
data = log["data"][2:]
# Non-indexed param layout: slot 9 = pairedToken (see contracts/test/LauncherFork.t.sol)
paired = "0x" + data[9 * 64 + 24 : 10 * 64]
token = "0x" + log["topics"][1][26:]
print(f"    token deployed:      {token}")
print(f"    pairedToken (event): {paired}")
if paired.lower() != hoodie:
    print("FAIL: token is NOT paired with $HOODIE"); sys.exit(1)
print("\nPROVEN: the launched token is paired with $HOODIE, on-chain, via the factory's own event.")
PY

echo "==> Demo complete. Anvil fork will now shut down."
