'use client';

import { useMemo, useState } from 'react';
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi';
import { launcherAbi } from '@/src/wrapper-abi';
import { DEFAULT_TICK, TICK_SPACING, marketCapForTick, tickForMarketCap } from '@/src/tick';
import { LockedPair } from './locked-pair';
import { type PairingProof, ProofBox, proofFromLogs } from './verify-pairing';

export function LaunchToken({ launcher }: { launcher: `0x${string}` | null }) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const { data: launcherName } = useReadContract({
    address: launcher ?? undefined,
    abi: launcherAbi,
    functionName: 'launcherName',
    query: { enabled: Boolean(launcher) },
  });

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [image, setImage] = useState('');
  const [description, setDescription] = useState('');
  const [marketCap, setMarketCap] = useState('10');
  const [manualTick, setManualTick] = useState('');
  const [feeBps, setFeeBps] = useState('100');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [proof, setProof] = useState<PairingProof | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  // Market cap (in $HOODIE) -> starting tick. Manual tick overrides.
  const { tick, tickError } = useMemo(() => {
    if (manualTick !== '') {
      const t = Number(manualTick);
      if (!Number.isInteger(t) || t % TICK_SPACING !== 0) {
        return { tick: null, tickError: `Manual tick must be a multiple of ${TICK_SPACING}` };
      }
      return { tick: t, tickError: '' };
    }
    try {
      return { tick: tickForMarketCap(Number(marketCap)), tickError: '' };
    } catch (e) {
      return { tick: null, tickError: e instanceof Error ? e.message : String(e) };
    }
  }, [marketCap, manualTick]);

  async function launch() {
    if (!launcher || tick === null) return;
    setBusy(true);
    setError('');
    setProof(null);
    try {
      const fee = Math.round(Number(feeBps));
      if (!Number.isInteger(fee) || fee < 0 || fee > 1000) throw new Error('Fee must be 0–1000 bps');
      if (!address) throw new Error('Connect a wallet first');

      const hash = await writeContractAsync({
        address: launcher,
        abi: launcherAbi,
        functionName: 'launch',
        args: [
          {
            // NOTE: no paired token argument exists — the contract injects $HOODIE.
            name,
            symbol,
            image,
            metadata: description ? JSON.stringify({ description }) : '',
            context: JSON.stringify({ interface: 'Launcher Launcher Mini App' }),
            tokenAdmin: address,
            startingTick: tick,
            clankerFeeBps: fee,
            pairedFeeBps: fee,
          },
        ],
      });
      setTxHash(hash);
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      const p = proofFromLogs(receipt.logs);
      if (!p) throw new Error('Launch confirmed but no TokenCreated event found');
      setProof(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!launcher) {
    return (
      <div className="card">
        <h2>Launch a token</h2>
        <p className="muted">Select a launcher from the list first (or create one).</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Launch a token {launcherName ? `via “${launcherName}”` : ''}</h2>
      <div className="row">
        <div>
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Token" />
        </div>
        <div>
          <label>Symbol</label>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="MTK" maxLength={12} />
        </div>
      </div>
      <label>Image URL (http or ipfs, optional)</label>
      <input value={image} onChange={(e) => setImage(e.target.value.trim())} placeholder="ipfs://…" />
      <label>Description (optional)</label>
      <input value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="row">
        <div>
          <label>Target starting market cap (in $HOODIE)</label>
          <input value={marketCap} onChange={(e) => setMarketCap(e.target.value)} inputMode="decimal" disabled={manualTick !== ''} />
        </div>
        <div>
          <label>LP fee (bps, each side, max 1000)</label>
          <input value={feeBps} onChange={(e) => setFeeBps(e.target.value)} inputMode="numeric" />
        </div>
      </div>
      <label>Manual tick override (advanced — leave empty to use market cap)</label>
      <input value={manualTick} onChange={(e) => setManualTick(e.target.value.trim())} placeholder={`default ${DEFAULT_TICK}`} />
      {manualTick !== '' && (
        <p className="warn">
          Manual tick overrides the market-cap input. Make sure you know the price this implies.
        </p>
      )}
      {tick !== null && (
        <p className="muted">
          Starting tick: <span className="mono">{tick}</span> ≈{' '}
          {marketCapForTick(tick).toLocaleString(undefined, { maximumFractionDigits: 2 })} $HOODIE market
          cap. (Market cap is denominated in $HOODIE — USD conversion needs a $HOODIE price feed.)
        </p>
      )}
      {tickError && <p className="error">{tickError}</p>}
      <LockedPair />
      <button onClick={launch} disabled={busy || !name || !symbol || tick === null}>
        {busy ? 'Launching…' : 'Launch (you sign the transaction)'}
      </button>
      {error && <p className="error">{error}</p>}
      {proof && <ProofBox proof={proof} txHash={txHash} />}
    </div>
  );
}
