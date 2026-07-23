'use client';

import { Clanker } from 'clanker-sdk/v4';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TransactionReceipt } from 'viem';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { CHAIN_ID, CLANKER_FACTORY, EXPLORER_URL, HOODIE_ADDRESS } from '@/src/hoodie';
import { assertHoodieInCalldata, buildLockedTokenConfig } from '@/src/hoodie-lock';
import { fetchHoodiePriceUsd, type HoodiePrice } from '@/src/hoodie-price';
import type { Launcher } from '@/src/registry';
import { CANONICAL_OPENING_TICK, marketCapForTick, marketCapUsdForTick } from '@/src/tick';
import { clankerTokenCreatedEventAbi } from '@/src/wrapper-abi';
import { copy } from '../lib/copy';
import { getFarcasterIdentity } from '../lib/farcaster-identity';
import { APP_URL } from '../lib/wagmi';
import { FeeSplit } from './fee-split';
import { LockedPair } from './locked-pair';
import { type PairingProof, proofFromLogs } from './verify-pairing';

type Phase = 'form' | 'confirm' | 'launching' | 'pending' | 'success' | 'error';
type ErrorKind = 'pairing' | 'walletTimeout' | 'generic';

/**
 * How long the wallet gets to come back with a tx hash after the user
 * confirms. The Farcaster host wallet proxies eth_sendTransaction and has
 * been observed to never resolve it on chains it can't fully reach — without
 * a bound the launching spinner would hang forever.
 */
const WALLET_RESPONSE_TIMEOUT_MS = 120_000;
/**
 * Bounded receipt wait (against OUR http RPC transport, never the wallet
 * provider) before we stop spinning and show the honest "still pending"
 * screen with the hash + explorer link.
 */
const RECEIPT_TIMEOUT_MS = 90_000;
/** While on the pending screen, keep re-checking this many times (~30 min). */
const MAX_PENDING_RECHECKS = 20;
/**
 * When the wallet ghosts (no hash after the bounded wait), one last check
 * before the error screen: scan this many recent blocks of factory logs for a
 * deploy the connected wallet is the tokenAdmin of. The host wallet has been
 * observed to broadcast successfully and still never resolve
 * eth_sendTransaction. ~10 minutes at Robinhood Chain's ~100ms block time.
 */
const RECOVERY_SCAN_BLOCKS = 6_000n;

const WALLET_TIMEOUT = Symbol('wallet-timeout');
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Screens 5–9: the launch flow. OFF-CHAIN enforcement model (the primary
 * shipped path): the user's own wallet signs a DIRECT Clanker v4 factory
 * `deployToken()` call built by the clanker-sdk, with the $HOODIE pairing
 * forced at the existing choke point — buildLockedTokenConfig writes the
 * constant, assertHoodieInCalldata re-verifies the encoded calldata before
 * the wallet is ever asked to sign.
 *
 * The opening tick is the fixed CANONICAL_OPENING_TICK (src/tick.ts): one
 * whitelistable (pairedToken + tick) config for clanker.world. No market-cap
 * or tick input exists on this screen; the live $HOODIE price (Dexscreener)
 * is fetched only to show the tick's USD equivalent.
 */
export function LaunchToken({
  launcher,
  onBack,
  onToast,
  onDone,
}: {
  launcher: Launcher;
  onBack: () => void;
  onToast: (msg: string) => void;
  onDone: () => void;
}) {
  const { address, chainId: walletChainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<Phase>('form');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [image, setImage] = useState('');
  const [description, setDescription] = useState('');

  const [price, setPrice] = useState<HoodiePrice | null>(null);

  const [formError, setFormError] = useState('');
  const [errorKind, setErrorKind] = useState<ErrorKind>('generic');
  const [errorDetail, setErrorDetail] = useState('');
  const [proof, setProof] = useState<PairingProof | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [lineIdx, setLineIdx] = useState(0);
  // True while the post-ghost log scan runs (changes the launching status line).
  const [recovering, setRecovering] = useState(false);

  // Bumped whenever the user leaves an in-flight launch (dismiss / retry) so
  // stale background receipt-watchers and late wallet responses become no-ops.
  const launchSeq = useRef(0);

  // USD display only — the tick itself is fixed and never depends on this.
  useEffect(() => {
    fetchHoodiePriceUsd().then(setPrice).catch(() => {});
  }, []);

  // Rotate the meme lines while the launching screen is up.
  useEffect(() => {
    if (phase !== 'launching') return;
    const t = setInterval(
      () => setLineIdx((i) => (i + 1) % copy.launching.lines.length),
      1800
    );
    return () => clearInterval(t);
  }, [phase]);

  const openingHoodie = useMemo(
    () =>
      marketCapForTick(CANONICAL_OPENING_TICK).toLocaleString(undefined, {
        maximumFractionDigits: 0,
      }),
    []
  );
  const openingUsd = price
    ? `$${marketCapUsdForTick(CANONICAL_OPENING_TICK, price.priceUsd).toLocaleString(undefined, {
        maximumFractionDigits: 0,
      })}`
    : null;
  const mcapDisplay = openingUsd ?? `${openingHoodie} $HOODIE`;

  function fail(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    setErrorKind(/hoodie|pair/i.test(msg) ? 'pairing' : 'generic');
    setErrorDetail(msg.split('\n')[0]);
    setPhase('error');
  }

  /** Registry write is display-only: fire-and-forget, never blocks success. */
  function recordLaunch(p: PairingProof, hash: `0x${string}`) {
    // Same best-effort identity capture as create-launcher: resolves to {}
    // outside a mini-app host, so the record simply lacks the launcher* fields.
    getFarcasterIdentity()
      .then((identity) =>
        fetch(`/api/launchers/${launcher.id}/launches`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            symbol,
            token: p.token,
            txHash: hash,
            ...(identity.fid !== undefined && { launcherFid: identity.fid }),
            ...(identity.username && { launcherUsername: identity.username }),
            ...(identity.pfpUrl && { launcherPfpUrl: identity.pfpUrl }),
          }),
        })
      )
      .then((res) => {
        if (!res.ok) throw new Error(`registry error (${res.status})`);
      })
      .catch(() => onToast(copy.toasts.registryFailed));
  }

  /**
   * Wait for the receipt on OUR RPC transport with a bounded first wait; if
   * it doesn't land in time, show the "still pending" screen (hash + explorer
   * link) and keep re-checking in the background until it lands, the user
   * leaves, or we give up quietly (the pending screen stays useful either way).
   */
  async function settle(hash: `0x${string}`, seq: number) {
    let receipt: TransactionReceipt | undefined;
    for (let attempt = 0; !receipt; attempt++) {
      try {
        receipt = await publicClient!.waitForTransactionReceipt({
          hash,
          timeout: RECEIPT_TIMEOUT_MS,
        });
      } catch {
        // Timeout, tx not yet visible, or a transient RPC error — all mean
        // "not confirmed yet", never "failed". Show the honest pending state.
        if (launchSeq.current !== seq || attempt >= MAX_PENDING_RECHECKS) return;
        setPhase('pending');
        await sleep(5_000);
      }
      if (launchSeq.current !== seq) return;
    }
    if (receipt.status !== 'success') {
      fail(new Error('the transaction reverted on-chain'));
      return;
    }
    const p = proofFromLogs(receipt.logs);
    if (!p) {
      fail(new Error('launch confirmed but no TokenCreated event found'));
      return;
    }
    setProof(p);
    setPhase('success');
    recordLaunch(p, hash);
  }

  /**
   * The wallet never answered, but the tx may have mined anyway. One bounded
   * scan of recent factory TokenCreated logs for a deploy whose tokenAdmin is
   * the connected wallet — tightened (finding A-03) so a stranger's (or an
   * older own) Clanker launch can never be adopted: a candidate must ALSO be
   * $HOODIE-paired and match the deploy we actually attempted, preferably by
   * the SDK-predicted token address (CREATE2, known before the wallet was
   * asked to sign) and otherwise by exact token name + symbol. Exactly one
   * match = the launch landed: adopt it. None or several = we can't
   * attribute anything safely; report false and let the caller show the
   * ghost error.
   */
  async function recoverFromSilentWallet(
    seq: number,
    expected: { token?: `0x${string}`; name: string; symbol: string }
  ): Promise<boolean> {
    if (!address || !publicClient) return false;
    try {
      const latest = await publicClient.getBlockNumber();
      const logs = await publicClient.getLogs({
        address: CLANKER_FACTORY,
        event: clankerTokenCreatedEventAbi[0],
        args: { tokenAdmin: address },
        fromBlock: latest > RECOVERY_SCAN_BLOCKS ? latest - RECOVERY_SCAN_BLOCKS : 0n,
        toBlock: latest,
      });
      const candidates = logs.filter(({ args: a }) => {
        if (!a.tokenAddress || !a.pairedToken || !a.poolId) return false;
        if (a.pairedToken.toLowerCase() !== HOODIE_ADDRESS.toLowerCase()) return false;
        return expected.token
          ? a.tokenAddress.toLowerCase() === expected.token.toLowerCase()
          : a.tokenName === expected.name && a.tokenSymbol === expected.symbol;
      });
      if (launchSeq.current !== seq || candidates.length !== 1) return false;
      const { args: eventArgs, transactionHash } = candidates[0];
      const p: PairingProof = {
        token: eventArgs.tokenAddress!,
        pairedToken: eventArgs.pairedToken!,
        poolId: eventArgs.poolId!,
        isHoodie: true,
      };
      setTxHash(transactionHash);
      setProof(p);
      setPhase('success');
      recordLaunch(p, transactionHash);
      return true;
    } catch {
      // RPC hiccup during the rescue — fall back to the honest ghost error.
      return false;
    }
  }

  /** A tx hash exists (possibly arriving late) — start the receipt watch. */
  function adopt(hash: `0x${string}`, seq: number) {
    if (launchSeq.current !== seq) return;
    setTxHash(hash);
    setPhase('launching');
    onToast(copy.toasts.txSubmitted);
    void settle(hash, seq);
  }

  async function launch() {
    const seq = ++launchSeq.current;
    setPhase('launching');
    setFormError('');
    setProof(null);
    setTxHash(undefined);

    let write: Promise<`0x${string}`> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The CREATE2 token address the SDK predicts for this exact deploy —
    // retained before the wallet is asked to sign so silent-wallet recovery
    // can demand it (finding A-03).
    let expectedToken: `0x${string}` | undefined;
    try {
      if (!address) throw new Error('connect a wallet first');
      // Never let the write silently target another chain: the Farcaster host
      // wallet can drift back to a chain it natively supports.
      if (walletChainId !== CHAIN_ID) throw new Error(copy.error.wrongChain);

      // 1. Config with pairedToken hardcoded to $HOODIE + the canonical tick.
      const config = buildLockedTokenConfig(launcher, {
        name,
        symbol,
        image: image || undefined,
        description: description || undefined,
        creator: address,
      });

      // 2. SDK encodes the raw factory deployToken() call (read-only).
      const clanker = new Clanker({ publicClient: publicClient! });
      const tx = await clanker.getDeployTransaction(config);
      expectedToken = tx.expectedAddress;

      // 3. Defense in depth: re-verify $HOODIE in the ENCODED calldata.
      assertHoodieInCalldata(tx.args[0]);

      // 4. The user's own wallet signs the direct factory call. chainId makes
      // wagmi itself refuse a wallet that is on the wrong chain, and the race
      // bounds a host wallet that never answers eth_sendTransaction.
      write = writeContractAsync({
        address: tx.address,
        abi: tx.abi,
        functionName: tx.functionName,
        args: tx.args,
        value: tx.value,
        chainId: CHAIN_ID,
      });
      const hash = await Promise.race([
        write,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(WALLET_TIMEOUT), WALLET_RESPONSE_TIMEOUT_MS);
        }),
      ]);
      adopt(hash, seq);
    } catch (e) {
      if (launchSeq.current !== seq) return;
      if (e === WALLET_TIMEOUT) {
        // No hash — but the host wallet has been seen broadcasting without
        // ever resolving. One bounded log scan before we call it ghosted.
        setRecovering(true);
        const rescued = await recoverFromSilentWallet(seq, {
          token: expectedToken,
          name,
          symbol,
        });
        setRecovering(false);
        if (rescued || launchSeq.current !== seq) return;
        setErrorKind('walletTimeout');
        setErrorDetail('');
        setPhase('error');
        // If the host wallet answers late, pick the launch back up automatically.
        write?.then(
          (hash) => adopt(hash, seq),
          () => {}
        );
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (/user rejected|denied|user cancelled/i.test(msg)) {
        // The user just backed out of the signature — keep it light.
        setFormError('signature declined — no launch happened.');
        setPhase('form');
        return;
      }
      fail(e);
    } finally {
      clearTimeout(timer);
    }
  }

  async function share() {
    const url = `${APP_URL}/l/${launcher.id}`;
    const text = copy.success.shareCast(url);
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      await sdk.actions.composeCast({ text, embeds: [url] });
    } catch {
      // Outside a Farcaster host: fall back to the clipboard.
      try {
        await navigator.clipboard.writeText(text);
        onToast(copy.toasts.copied);
      } catch {
        /* clipboard unavailable */
      }
    }
  }

  function resetForAnother() {
    launchSeq.current++; // stop any background receipt watch
    setName('');
    setSymbol('');
    setImage('');
    setDescription('');
    setProof(null);
    setTxHash(undefined);
    setPhase('form');
  }

  /* ---------- launching (screen 6) ---------- */
  if (phase === 'launching') {
    return (
      <div className="center" style={{ flex: 1 }}>
        <div className="spin" aria-hidden />
        <p className="meme-caption" style={{ fontSize: 20 }} aria-live="polite">
          {copy.launching.lines[lineIdx]}
        </p>
        <p className="muted" style={{ marginTop: 8 }}>
          {txHash
            ? copy.launching.status
            : recovering
              ? copy.launching.recovering
              : 'waiting for your signature…'}
        </p>
        {txHash && (
          <a
            className="mono"
            style={{ marginTop: 10 }}
            href={`${EXPLORER_URL}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {copy.launching.viewTx}
          </a>
        )}
      </div>
    );
  }

  /* ---------- still pending (bounded wait ran out) ---------- */
  if (phase === 'pending' && txHash) {
    return (
      <>
        <div className="center" style={{ flex: 1 }}>
          <Image
            src="/brand/yo-dawg-transparent.png"
            alt="Yo Dawg mascot"
            width={140}
            height={140}
            className="mascot"
          />
          <h1 className="meme-caption" style={{ fontSize: 22 }}>
            {copy.pending.title}
          </h1>
          <p className="meme-sub">{copy.pending.body}</p>
          <div className="card" style={{ width: '100%', textAlign: 'left', marginTop: 14 }}>
            <div className="muted">{copy.pending.txLabel}</div>
            <b style={{ fontSize: 13 }} className="mono">
              <a href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer">
                {txHash}
              </a>
            </b>
            <div className="hint" style={{ marginTop: 6 }}>{copy.pending.hint}</div>
          </div>
        </div>
        <button
          className="btn"
          onClick={() => {
            launchSeq.current++;
            onDone();
          }}
        >
          {copy.pending.dismiss}
        </button>
      </>
    );
  }

  /* ---------- success (screen 7) ---------- */
  if (phase === 'success' && proof) {
    return (
      <>
        <div className="center" style={{ flex: 1 }}>
          <Image
            src="/brand/yo-dawg-transparent.png"
            alt="Yo Dawg mascot"
            width={140}
            height={140}
            className="mascot"
          />
          <h1 className="meme-caption" style={{ fontSize: 22, whiteSpace: 'pre-line' }}>
            {copy.success.title}
          </h1>
          {proof.isHoodie ? (
            <div className="stamp">{copy.success.stamp}</div>
          ) : (
            <p className="error-code">{copy.verify.failed}</p>
          )}
          <div className="card" style={{ width: '100%', textAlign: 'left', marginTop: 14 }}>
            <div className="muted">{copy.success.tokenLabel}</div>
            <b style={{ fontSize: 13 }} className="mono">
              <a href={`${EXPLORER_URL}/token/${proof.token}`} target="_blank" rel="noreferrer">
                {proof.token}
              </a>
            </b>
            <div className="muted" style={{ marginTop: 6 }}>
              {copy.success.pairedLabel}
            </div>
            <b style={{ fontSize: 13 }}>
              {proof.isHoodie ? copy.success.pairedValue : <span className="mono">{proof.pairedToken}</span>}
            </b>
            {txHash && (
              <div style={{ marginTop: 8 }}>
                <a className="mono" href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer">
                  view transaction
                </a>
              </div>
            )}
          </div>
        </div>
        <button className="btn neon" onClick={share}>
          {copy.success.button}
        </button>
        <button className="linkish" style={{ margin: '10px auto 0' }} onClick={resetForAnother}>
          launch another one
        </button>
        <button className="linkish" style={{ margin: '4px auto 0' }} onClick={onDone}>
          back to the launchers
        </button>
      </>
    );
  }

  /* ---------- error (screen 8) ---------- */
  if (phase === 'error') {
    const title =
      errorKind === 'pairing'
        ? copy.error.title
        : errorKind === 'walletTimeout'
          ? copy.error.walletTimeoutTitle
          : copy.error.genericTitle;
    const body =
      errorKind === 'pairing'
        ? copy.error.pairingBody
        : errorKind === 'walletTimeout'
          ? copy.error.walletTimeoutBody
          : copy.error.genericBody;
    return (
      <>
        <div className="center" style={{ flex: 1 }}>
          <Image
            src="/brand/yo-dawg-transparent.png"
            alt="Yo Dawg mascot"
            width={140}
            height={140}
            className="mascot"
          />
          <h1 className="meme-caption" style={{ fontSize: 22 }}>
            {title}
          </h1>
          <p className="meme-sub">{body}</p>
          {errorKind === 'pairing' && <p className="error-code">{copy.error.pairingCode}</p>}
          {errorKind === 'generic' && <p className="error-code">error: {errorDetail}</p>}
        </div>
        <button
          className="btn"
          onClick={() => {
            launchSeq.current++; // cancel any late wallet-response rescue
            setPhase('form');
          }}
        >
          {errorKind === 'pairing' ? copy.error.button : copy.error.genericButton}
        </button>
      </>
    );
  }

  /* ---------- form (screen 5) + confirm modal ---------- */
  return (
    <>
      <button className="linkish" onClick={onBack}>
        ← back
      </button>
      <h1 className="meme-caption" style={{ fontSize: 19 }}>
        {copy.launch.title}
      </h1>
      <p className="meme-sub">
        via “{launcher.name}”
        {launcher.creatorUsername ? (
          <>
            {' '}
            <a
              className="creator-link"
              href={`https://farcaster.xyz/${launcher.creatorUsername}`}
              target="_blank"
              rel="noreferrer"
            >
              {launcher.creatorPfpUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={launcher.creatorPfpUrl} alt="" width={20} height={20} className="creator-pfp" />
              )}
              {copy.home.creator(`@${launcher.creatorUsername}`)}
            </a>
          </>
        ) : (
          <span className="muted">
            {' '}
            {copy.home.creator(`${launcher.feeRecipient.slice(0, 6)}…${launcher.feeRecipient.slice(-4)}`)}
          </span>
        )}
      </p>

      <div className="row">
        <div className="field grow">
          <label>{copy.launch.nameLabel}</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="hoodie coin"
          />
        </div>
        <div className="field">
          <label>{copy.launch.tickerLabel}</label>
          <input
            className="input"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="HOOD2"
            maxLength={12}
            style={{ width: 110 }}
          />
        </div>
      </div>

      <div className="field">
        <label>{copy.launch.mcapLabel}</label>
        <div className="locked">{copy.launch.mcapLocked(mcapDisplay)}</div>
      </div>

      <LockedPair />

      <FeeSplit lpRewardBps={launcher.lpRewardBps} />

      <details className="advanced">
        <summary>{copy.launch.advanced}</summary>
        <div className="field">
          <label>image URL (http or ipfs)</label>
          <input
            className="input"
            value={image}
            onChange={(e) => setImage(e.target.value.trim())}
            placeholder="ipfs://…"
          />
        </div>
        <div className="field">
          <label>description</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </details>

      {formError && <p className="error-code">error: {formError}</p>}

      <button
        className="btn bottom"
        onClick={() => setPhase('confirm')}
        disabled={!name || !symbol || !address}
      >
        {copy.launch.button}
      </button>

      {phase === 'confirm' && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-title">{copy.confirm.title}</div>
            <p style={{ fontSize: 12, textAlign: 'center', margin: '6px 0 10px' }}>
              {copy.confirm.body(`$${symbol}`, mcapDisplay)}
            </p>
            <div className="warnbar" style={{ margin: '0 0 10px' }}>{copy.confirm.warn}</div>
            <div className="row">
              <button className="btn alt sm" onClick={() => setPhase('form')}>
                {copy.confirm.cancel}
              </button>
              <button className="btn neon sm" onClick={launch}>
                {copy.confirm.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
