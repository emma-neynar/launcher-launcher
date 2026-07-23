/**
 * Classifying wallet/provider failures from writeContractAsync.
 *
 * Did the call fail on the PROVIDER side (as opposed to the user declining or
 * the contract reverting)? With the Farcaster host wallet on chain 4663 a
 * provider error like "Unknown provider RPC error" does NOT prove nothing was
 * broadcast — the same wallet has been seen sending successfully while
 * erroring/ghosting on eth_sendTransaction, so the caller runs the bounded
 * on-chain recovery scan before showing an error.
 *
 * The error can arrive in TWO distinct shapes (both seen 2026-07-23, wallet
 * 0x6108…):
 *
 * 1. viem-wrapped. eth_sendTransaction goes through viem's custom transport
 *    (buildRequest), which maps the provider's numeric code onto a viem
 *    RpcError subclass and buries it in a ContractFunctionExecutionError
 *    cause chain. Codes viem doesn't recognize become UnknownRpcError;
 *    -32603 becomes InternalRpcError; but codes like -32000 become
 *    InvalidInputRpcError etc. — so matching only Unknown/Internal is not
 *    enough, and the ORIGINAL provider error stays reachable as a cause.
 *
 * 2. RAW. wagmi's writeContract calls connector.getChainId() (a bare
 *    provider.request for eth_chainId) BEFORE viem's action ever runs, and
 *    the @farcaster/miniapp-wagmi-connector passes provider errors through
 *    untouched. Those are ox errors from @farcaster/miniapp-sdk's
 *    ethereumProvider: plain Error subclasses (NOT viem BaseErrors) carrying
 *    a numeric EIP-1193/JSON-RPC `code`, with names like "ProviderRpcError",
 *    "Provider.*", "RpcResponse.*". A `!(e instanceof BaseError)` guard would
 *    (and did) drop these on the floor.
 *
 * TRAP (proven by direct reproduction): the SDK's ox pipeline rewrites every
 * host code it doesn't recognize into RpcResponse.InternalError (-32603), and
 * viem's getContractError treats a -32603 WITH a message as an on-chain
 * revert (geth reports real reverts that way) — fabricating a
 * ContractFunctionRevertedError whose `reason` is the provider's message and
 * DROPPING the ox cause from the chain. So a revert whose reason is the
 * SDK's own literal is a provider flake wearing a revert costume, and must be
 * matched BEFORE the real-revert exclusion.
 *
 * ox is not a direct dependency of this app (it's transitive via
 * @farcaster/miniapp-sdk), so we match its errors structurally — by numeric
 * code + class name — instead of importing classes whose identity depends on
 * hoisting and bundler module resolution.
 *
 * Deliberately narrow:
 *   - user rejection is NEVER a flake: viem's UserRejectedRequestError, and
 *     any raw error carrying EIP-1193 code 4001 (the SDK maps a host 4001 to
 *     ox Provider.UserRejectedRequestError) — the caller must keep the quiet
 *     back-to-form path.
 *   - a decodable ContractFunctionRevertedError is a real revert, not a flake.
 *   - recognized EIP-1193 provider codes (unauthorized / unsupported method /
 *     disconnected / chain-switch) mean something specific and keep the
 *     generic error path.
 */

import {
  BaseError,
  ContractFunctionRevertedError,
  InternalRpcError,
  ProviderRpcError,
  UnknownRpcError,
  UserRejectedRequestError,
} from 'viem';

/**
 * The literal message @farcaster/miniapp-sdk substitutes when the host wallet
 * returns an error carrying no `details` (toProviderRpcError in the SDK's
 * ethereumProvider). Matching this exact string is safe: it is the SDK's OWN
 * generated literal — never ABI text or user input — and it's the signature
 * of the Farcaster mobile host failing on chains it can't fully reach.
 */
export const FARCASTER_UNKNOWN_PROVIDER_MESSAGE = 'Unknown provider RPC error';

/** EIP-1193 codes with a specific meaning — not treated as provider flakes. */
const KNOWN_EIP1193_CODES = [4001, 4100, 4200, 4900, 4901, 4902];

/** ox error class names (Provider.* / RpcResponse.* families). */
const OX_ERROR_NAME = /^(ProviderRpcError$|Provider\.|RpcResponse\.)/;

/** The numeric EIP-1193/JSON-RPC code an error carries, if any. */
function errorCode(e: unknown): number | undefined {
  if (
    e instanceof Error &&
    'code' in e &&
    typeof (e as { code: unknown }).code === 'number'
  ) {
    return (e as { code: number }).code;
  }
  return undefined;
}

/**
 * The error plus its full cause chain, oldest-wrapper first. Works for viem
 * BaseErrors and plain Errors alike (both chain via `cause`); bounded so a
 * pathological cycle can't hang the UI thread.
 */
function causeChain(e: unknown): unknown[] {
  const chain: unknown[] = [];
  let cur: unknown = e;
  while (cur !== null && cur !== undefined && chain.length < 16) {
    if (chain.includes(cur)) break;
    chain.push(cur);
    cur = cur instanceof Error ? cur.cause : undefined;
  }
  return chain;
}

export function isProviderSideError(e: unknown): boolean {
  const chain = causeChain(e);

  for (const err of chain) {
    if (err instanceof UserRejectedRequestError) return false;
    if (errorCode(err) === 4001) return false;
  }

  for (const err of chain) {
    if (err instanceof ContractFunctionRevertedError) {
      // viem fabricates this shape from a -32603 provider error (see TRAP
      // above); when the "revert reason" is the SDK's own literal it can only
      // be the Farcaster provider flaking, never real ABI/revert text.
      return err.reason === FARCASTER_UNKNOWN_PROVIDER_MESSAGE;
    }
    // viem-wrapped shapes.
    if (err instanceof UnknownRpcError || err instanceof InternalRpcError) return true;
    if (err instanceof ProviderRpcError && !KNOWN_EIP1193_CODES.includes(err.code)) {
      return true;
    }
    // Raw ox shapes from the Farcaster miniapp provider (also present as the
    // innermost cause of the viem-wrapped shapes, which covers viem mappings
    // like InvalidInputRpcError for a host -32000).
    if (err instanceof Error && !(err instanceof BaseError)) {
      const code = errorCode(err);
      if (code === undefined) continue;
      if (err.message === FARCASTER_UNKNOWN_PROVIDER_MESSAGE) return true;
      if (OX_ERROR_NAME.test(err.name) && !KNOWN_EIP1193_CODES.includes(code)) {
        return true;
      }
    }
  }
  return false;
}
