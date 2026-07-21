'use client';

import { useState } from 'react';
import { decodeEventLog, isAddress } from 'viem';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { launcherLauncherAbi } from '@/src/wrapper-abi';
import { copy } from '../lib/copy';
import { LAUNCHER_LAUNCHER_ADDRESS } from '../lib/wagmi';

export function CreateLauncher({
  onCreated,
  onToast,
  onBack,
}: {
  onCreated: (launcher: `0x${string}`) => void;
  onToast: (msg: string) => void;
  onBack: () => void;
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [name, setName] = useState('');
  const [feeRecipient, setFeeRecipient] = useState('');
  const [lpShare, setLpShare] = useState('20');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const recipient = feeRecipient || address || '';
  const shareNum = Number(lpShare);
  const rest = Number.isFinite(shareNum) ? Math.max(0, 100 - shareNum) : 80;

  async function create() {
    setBusy(true);
    setError('');
    try {
      if (!isAddress(recipient)) throw new Error('fee recipient must be a valid address');
      const bps = Math.round(Number(lpShare) * 100);
      if (!Number.isInteger(bps) || bps < 0 || bps > 5000) {
        throw new Error('your cut must be between 0% and 50%');
      }
      const hash = await writeContractAsync({
        address: LAUNCHER_LAUNCHER_ADDRESS,
        abi: launcherLauncherAbi,
        functionName: 'createLauncher',
        args: [name, recipient as `0x${string}`, bps],
      });
      onToast(copy.toasts.txSubmitted);
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== LAUNCHER_LAUNCHER_ADDRESS.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({
            abi: launcherLauncherAbi,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'LauncherCreated') {
            onToast(copy.create.successToast);
            onCreated(decoded.args.launcher);
            return;
          }
        } catch {
          // other event
        }
      }
      throw new Error('transaction confirmed but no LauncherCreated event found');
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
      <p className="meme-sub">{copy.create.sub}</p>

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
        <label>{copy.create.feeLabel}</label>
        <input
          className="input"
          value={feeRecipient}
          onChange={(e) => setFeeRecipient(e.target.value.trim())}
          placeholder={address ? `${address.slice(0, 6)}…${address.slice(-4)} (you)` : '0x…'}
        />
      </div>
      <div className="field">
        <label>{copy.create.cutLabel}</label>
        <input
          className="input"
          value={lpShare}
          onChange={(e) => setLpShare(e.target.value)}
          inputMode="decimal"
        />
        <div className="hint">{copy.create.cutHint(rest)}</div>
      </div>

      {!LAUNCHER_LAUNCHER_ADDRESS && (
        <div className="warnbar">
          NEXT_PUBLIC_LAUNCHER_LAUNCHER_ADDRESS is not set — deploy the wrapper first.
        </div>
      )}
      {error && <p className="error-code">error: {error}</p>}

      <button
        className="btn bottom"
        onClick={create}
        disabled={busy || !name || !LAUNCHER_LAUNCHER_ADDRESS}
      >
        {busy ? 'making it so…' : copy.create.button}
      </button>
    </>
  );
}
