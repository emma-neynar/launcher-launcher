'use client';

import { Clanker } from 'clanker-sdk/v4';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { EXPLORER_URL } from '@/src/hoodie';
import { assertHoodieInCalldata, buildLockedTokenConfig } from '@/src/hoodie-lock';
import { fetchHoodiePriceUsd, type HoodiePrice } from '@/src/hoodie-price';
import type { Launcher } from '@/src/registry';
import { CANONICAL_OPENING_TICK, marketCapForTick, marketCapUsdForTick } from '@/src/tick';
import { copy } from '../lib/copy';
import { APP_URL } from '../lib/wagmi';
import { FeeSplit } from './fee-split';
import { LockedPair } from './locked-pair';
import { type PairingProof, proofFromLogs } from './verify-pairing';

type Phase = 'form' | 'confirm' | 'launching' | 'success' | 'error';

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
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<Phase>('form');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [image, setImage] = useState('');
  const [description, setDescription] = useState('');

  const [price, setPrice] = useState<HoodiePrice | null>(null);

  const [formError, setFormError] = useState('');
  const [isPairingError, setIsPairingError] = useState(false);
  const [errorDetail, setErrorDetail] = useState('');
  const [proof, setProof] = useState<PairingProof | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [lineIdx, setLineIdx] = useState(0);

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

  async function launch() {
    setPhase('launching');
    setFormError('');
    setProof(null);
    setTxHash(undefined);
    try {
      if (!address) throw new Error('connect a wallet first');

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

      // 3. Defense in depth: re-verify $HOODIE in the ENCODED calldata.
      assertHoodieInCalldata(tx.args[0]);

      // 4. The user's own wallet signs the direct factory call.
      const hash = await writeContractAsync({
        address: tx.address,
        abi: tx.abi,
        functionName: tx.functionName,
        args: tx.args,
        value: tx.value,
      });
      setTxHash(hash);
      onToast(copy.toasts.txSubmitted);
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      const p = proofFromLogs(receipt.logs);
      if (!p) throw new Error('launch confirmed but no TokenCreated event found');
      setProof(p);
      setPhase('success');

      // Record in the registry (display-only; failure doesn't affect the launch).
      fetch(`/api/launchers/${launcher.id}/launches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, symbol, token: p.token, txHash: hash }),
      }).catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/user rejected|denied|user cancelled/i.test(msg)) {
        // The user just backed out of the signature — keep it light.
        setFormError('signature declined — no launch happened.');
        setPhase('form');
        return;
      }
      setIsPairingError(/hoodie|pair/i.test(msg));
      setErrorDetail(msg.split('\n')[0]);
      setPhase('error');
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
        <p className="meme-caption sm" style={{ fontSize: 15, marginTop: 16 }} aria-live="polite">
          {copy.launching.lines[lineIdx]}
        </p>
        <p className="meme-sub" style={{ marginTop: 8 }}>
          {txHash ? copy.launching.status : 'waiting for your signature…'}
        </p>
      </div>
    );
  }

  /* ---------- success (screen 7) ---------- */
  if (phase === 'success' && proof) {
    return (
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
        <div className="card" style={{ width: '100%', textAlign: 'left', marginTop: 12 }}>
          <div className="hint">{copy.success.tokenLabel}</div>
          <div className="mono">
            <a href={`${EXPLORER_URL}/token/${proof.token}`} target="_blank" rel="noreferrer">
              {proof.token}
            </a>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            {copy.success.pairedLabel}
          </div>
          <div>{proof.isHoodie ? copy.success.pairedValue : <span className="mono">{proof.pairedToken}</span>}</div>
          {txHash && (
            <div style={{ marginTop: 8 }}>
              <a className="mono" href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer">
                view transaction
              </a>
            </div>
          )}
        </div>
        <button className="btn neon" style={{ width: '100%', marginTop: 12 }} onClick={share}>
          {copy.success.button}
        </button>
        <button className="linkish" style={{ marginTop: 10 }} onClick={resetForAnother}>
          launch another one
        </button>
        <button className="linkish" style={{ marginTop: 4 }} onClick={onDone}>
          back to the launchers
        </button>
      </div>
    );
  }

  /* ---------- error (screen 8) ---------- */
  if (phase === 'error') {
    return (
      <div className="center" style={{ flex: 1 }}>
        <Image
          src="/brand/yo-dawg-transparent.png"
          alt="Yo Dawg mascot"
          width={140}
          height={140}
          className="mascot"
        />
        <h1 className="meme-caption" style={{ fontSize: 22 }}>
          {isPairingError ? copy.error.title : copy.error.genericTitle}
        </h1>
        <p className="meme-sub">{isPairingError ? copy.error.pairingBody : copy.error.genericBody}</p>
        <p className="error-code">{isPairingError ? copy.error.pairingCode : `error: ${errorDetail}`}</p>
        <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={() => setPhase('form')}>
          {isPairingError ? copy.error.button : copy.error.genericButton}
        </button>
      </div>
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
      <p className="meme-sub">via “{launcher.name}”</p>

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
        className="btn neon bottom"
        onClick={() => setPhase('confirm')}
        disabled={!name || !symbol || !address}
      >
        {copy.launch.button}
      </button>

      {phase === 'confirm' && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-title">{copy.confirm.title}</div>
            <p>{copy.confirm.body(`$${symbol}`, mcapDisplay)}</p>
            <div className="warnbar">{copy.confirm.warn}</div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn alt" onClick={() => setPhase('form')}>
                {copy.confirm.cancel}
              </button>
              <button className="btn neon" onClick={launch}>
                {copy.confirm.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
