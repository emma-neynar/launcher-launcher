'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { DEFAULT_LP_REWARD_BPS, MAX_LP_REWARD_BPS, isValidLpRewardBps } from '@/src/fees';
import { createLauncherMessage } from '@/src/launcher-auth';
import type { Launcher } from '@/src/registry';
import { copy } from '../lib/copy';
import { getFarcasterIdentity } from '../lib/farcaster-identity';
import { FeeSplit } from './fee-split';

/**
 * Screen 4 — create a launcher (off-chain model: a saved registry config, no
 * transaction to sign — but one free personal_sign message: the server only
 * registers a launcher whose feeRecipient signed its exact config, see
 * src/launcher-auth.ts). Exactly ONE user-set parameter: lpRewardBps. The fee
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
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [cutPct, setCutPct] = useState(String(DEFAULT_LP_REWARD_BPS / 100));
  const [busy, setBusy] = useState<false | 'signing' | 'saving'>(false);
  const [error, setError] = useState('');

  const lpRewardBps = Math.round(Number(cutPct) * 100);
  const cutValid = isValidLpRewardBps(lpRewardBps);

  async function create() {
    if (!address) return;
    setBusy('signing');
    setError('');
    try {
      // Prove control of the fee-recipient wallet: plain personal_sign over
      // the exact config (works in every wallet incl. Farcaster's embedded
      // one). Costs nothing, sends no transaction.
      const issuedAt = new Date().toISOString();
      let signature: `0x${string}`;
      try {
        signature = await signMessageAsync({
          message: createLauncherMessage({ name: name.trim(), feeRecipient: address, lpRewardBps, issuedAt }),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/user rejected|denied|user cancelled/i.test(msg)) {
          setError('signature declined — no launcher made.');
          return;
        }
        throw e;
      }
      setBusy('saving');
      const identity = await getFarcasterIdentity();
      const creator = {
        ...(identity.fid !== undefined && { creatorFid: identity.fid }),
        ...(identity.username && { creatorUsername: identity.username }),
        ...(identity.pfpUrl && { creatorPfpUrl: identity.pfpUrl }),
      };
      const res = await fetch('/api/launchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, feeRecipient: address, lpRewardBps, signature, issuedAt, ...creator }),
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

      <button className="btn bottom" onClick={create} disabled={!!busy || !name || !cutValid || !address}>
        {busy === 'signing' ? copy.create.signing : busy === 'saving' ? 'making it so…' : copy.create.button}
      </button>
    </>
  );
}

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
