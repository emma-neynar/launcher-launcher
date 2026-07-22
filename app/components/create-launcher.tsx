'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAccount } from 'wagmi';
import { DEFAULT_LP_REWARD_BPS, MAX_LP_REWARD_BPS, isValidLpRewardBps } from '@/src/fees';
import type { Launcher } from '@/src/registry';
import { copy } from '../lib/copy';
import { FeeSplit } from './fee-split';

/**
 * Screen 4 — create a launcher (off-chain model: a saved registry config, no
 * transaction to sign). Exactly ONE user-set parameter: lpRewardBps. The fee
 * recipient is forced to the connected wallet; the pairing and token config
 * are house rules.
 */
export function CreateLauncher({
  onCreated,
  onToast,
  onBack,
}: {
  onCreated: (launcher: Launcher) => void;
  onToast: (msg: string) => void;
  onBack: () => void;
}) {
  const { address } = useAccount();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [cutPct, setCutPct] = useState(String(DEFAULT_LP_REWARD_BPS / 100));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const lpRewardBps = Math.round(Number(cutPct) * 100);
  const cutValid = isValidLpRewardBps(lpRewardBps);

  async function create() {
    if (!address) return;
    setBusy(true);
    setError('');
    try {
      const creator = await getCreatorIdentity();
      const res = await fetch('/api/launchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, feeRecipient: address, lpRewardBps, ...creator }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `registry error (${res.status})`);
      await queryClient.invalidateQueries({ queryKey: ['launchers'] });
      onToast(copy.create.successToast);
      onCreated(body as Launcher);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="linkish" onClick={onBack}>
        ← back
      </button>
      <h1 className="meme-caption" style={{ fontSize: 19 }}>
        {copy.create.title}
      </h1>

      <div className="field">
        <label>{copy.create.nameLabel}</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="hood factory"
          maxLength={64}
        />
      </div>
      <div className="field">
        <label>{copy.create.cutLabel}</label>
        <input
          className="input"
          value={cutPct}
          onChange={(e) => setCutPct(e.target.value)}
          inputMode="decimal"
        />
        <div className="hint">{copy.create.cutHint(MAX_LP_REWARD_BPS / 100)}</div>
        {address && <div className="hint">{copy.create.feeRecipientNote(short(address))}</div>}
      </div>

      <FeeSplit lpRewardBps={cutValid ? lpRewardBps : DEFAULT_LP_REWARD_BPS} />

      {!cutValid && cutPct !== '' && (
        <p className="error-code">error: your cut must be between 0% and {MAX_LP_REWARD_BPS / 100}%</p>
      )}
      {error && <p className="error-code">error: {error}</p>}

      <button className="btn bottom" onClick={create} disabled={busy || !name || !cutValid || !address}>
        {busy ? 'making it so…' : copy.create.button}
      </button>
    </>
  );
}

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/**
 * Best-effort Farcaster identity for the launcher card ("made by @…"). Only
 * resolvable inside a mini-app host; sdk.context can hang forever in a plain
 * browser, so (mirroring useIsInMiniApp in wallet.tsx) a top-level tab bails
 * synchronously and anything host-shaped is raced against a 2s timeout.
 * Failure is never an error — the card just falls back to the fee address.
 */
async function getCreatorIdentity(): Promise<{
  creatorFid?: number;
  creatorUsername?: string;
  creatorPfpUrl?: string;
}> {
  if (
    window === window.parent &&
    !(window as { ReactNativeWebView?: unknown }).ReactNativeWebView
  ) {
    return {};
  }
  try {
    const { sdk } = await import('@farcaster/miniapp-sdk');
    const ctx = await Promise.race([
      sdk.context,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_000)),
    ]);
    const user = ctx?.user;
    if (!user || !Number.isInteger(user.fid) || user.fid <= 0) return {};
    return {
      creatorFid: user.fid,
      ...(user.username && { creatorUsername: user.username }),
      ...(user.pfpUrl && { creatorPfpUrl: user.pfpUrl }),
    };
  } catch {
    return {};
  }
}
