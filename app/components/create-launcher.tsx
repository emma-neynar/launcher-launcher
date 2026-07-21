'use client';

import { useState } from 'react';
import { decodeEventLog, isAddress } from 'viem';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { EXPLORER_URL, HOODIE_ADDRESS } from '@/src/hoodie';
import { launcherLauncherAbi } from '@/src/wrapper-abi';
import { LAUNCHER_LAUNCHER_ADDRESS } from '../lib/wagmi';
import { LockedPair } from './locked-pair';

export function CreateLauncher({ onCreated }: { onCreated: (launcher: `0x${string}`) => void }) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [name, setName] = useState('');
  const [feeRecipient, setFeeRecipient] = useState('');
  const [lpShare, setLpShare] = useState('20');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<`0x${string}` | null>(null);

  const recipient = feeRecipient || address || '';

  async function create() {
    setBusy(true);
    setError('');
    try {
      if (!isAddress(recipient)) throw new Error('Fee recipient must be a valid address');
      const bps = Math.round(Number(lpShare) * 100);
      if (!Number.isInteger(bps) || bps < 0 || bps > 5000) {
        throw new Error('LP reward share must be between 0% and 50%');
      }
      const hash = await writeContractAsync({
        address: LAUNCHER_LAUNCHER_ADDRESS,
        abi: launcherLauncherAbi,
        functionName: 'createLauncher',
        args: [name, recipient as `0x${string}`, bps],
      });
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== LAUNCHER_LAUNCHER_ADDRESS.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({ abi: launcherLauncherAbi, data: log.data, topics: log.topics });
          if (decoded.eventName === 'LauncherCreated') {
            setCreated(decoded.args.launcher);
            onCreated(decoded.args.launcher);
            break;
          }
        } catch {
          // other event
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Create your Launcher</h2>
      <p className="muted">
        Your own on-chain token launcher. You pick the name and where your share of LP fee rewards
        goes. The pairing rule is inherited and cannot be changed — by you or anyone.
      </p>
      <label>Launcher name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Hoodie Season" maxLength={64} />
      <label>Fee recipient (defaults to your wallet)</label>
      <input value={feeRecipient} onChange={(e) => setFeeRecipient(e.target.value.trim())} placeholder={address ?? '0x…'} />
      <label>Your share of LP fee rewards (%) — max 50, the rest goes to each token&apos;s creator</label>
      <input value={lpShare} onChange={(e) => setLpShare(e.target.value)} inputMode="decimal" />
      <LockedPair />
      <button onClick={create} disabled={busy || !name || !LAUNCHER_LAUNCHER_ADDRESS}>
        {busy ? 'Creating…' : 'Create Launcher'}
      </button>
      {!LAUNCHER_LAUNCHER_ADDRESS && (
        <p className="warn">NEXT_PUBLIC_LAUNCHER_LAUNCHER_ADDRESS is not set — deploy the wrapper first.</p>
      )}
      {error && <p className="error">{error}</p>}
      {created && (
        <p className="success mono">
          Launcher created:{' '}
          <a href={`${EXPLORER_URL}/address/${created}`} target="_blank" rel="noreferrer">
            {created}
          </a>
        </p>
      )}
    </div>
  );
}

export function lockedPairLabel() {
  return `$HOODIE ${HOODIE_ADDRESS}`;
}
