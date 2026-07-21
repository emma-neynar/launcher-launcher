'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi';
import { launcherAbi } from '@/src/wrapper-abi';
import {
  DEFAULT_MARKET_CAP_USD,
  DEFAULT_TICK,
  TICK_SPACING,
  marketCapForTick,
  marketCapUsdForTick,
  tickForMarketCapUsd,
} from '@/src/tick';
import { fetchHoodiePriceUsd, type HoodiePrice } from '@/src/hoodie-price';
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
  const [marketCapUsd, setMarketCapUsd] = useState(String(DEFAULT_MARKET_CAP_USD));
  const [manualTick, setManualTick] = useState('');
  const [feeBps, setFeeBps] = useState('100');

  const [price, setPrice] = useState<HoodiePrice | null>(null);
  const [priceError, setPriceError] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [proof, setProof] = useState<PairingProof | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  async function loadPrice() {
    setPriceError('');
    try {
      setPrice(await fetchHoodiePriceUsd());
    } catch (e) {
      setPrice(null);
      setPriceError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    loadPrice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // USD market cap -> starting tick via the live $HOODIE price. Manual tick overrides.
  const { tick, tickError } = useMemo(() => {
    if (manualTick !== '') {
      const t = Number(manualTick);
      if (!Number.isInteger(t) || t % TICK_SPACING !== 0) {
        return { tick: null, tickError: `Manual tick must be a multiple of ${TICK_SPACING}` };
      }
      return { tick: t, tickError: '' };
    }
    if (!price) {
      return {
        tick: null,
        tickError: 'No live $HOODIE price — retry the price fetch or set a manual tick below.',
      };
    }
    try {
      return { tick: tickForMarketCapUsd(Number(marketCapUsd), price.priceUsd), tickError: '' };
    } catch (e) {
      return { tick: null, tickError: e instanceof Error ? e.message : String(e) };
    }
  }, [marketCapUsd, manualTick, price]);

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
          <label>Target starting market cap (USD)</label>
          <input value={marketCapUsd} onChange={(e) => setMarketCapUsd(e.target.value)} inputMode="decimal" disabled={manualTick !== ''} />
        </div>
        <div>
          <label>LP fee (bps, each side, max 1000)</label>
          <input value={feeBps} onChange={(e) => setFeeBps(e.target.value)} inputMode="numeric" />
        </div>
      </div>
      {price ? (
        <p className="muted">
          $HOODIE price: <span className="mono">${price.priceUsd.toPrecision(4)}</span> — source:{' '}
          {price.source}.{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); loadPrice(); }}>Refresh</a>
        </p>
      ) : (
        <p className="warn">
          Could not fetch a live $HOODIE price{priceError ? ` (${priceError})` : ''}.{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); loadPrice(); }}>Retry</a> — or use the
          manual tick override below.
        </p>
      )}
      <label>Manual tick override (advanced — leave empty to use market cap)</label>
      <input value={manualTick} onChange={(e) => setManualTick(e.target.value.trim())} placeholder={`contract fallback ${DEFAULT_TICK}`} />
      {manualTick !== '' && (
        <p className="warn">
          Manual tick overrides the market-cap input — you are setting the raw starting price.
          {tick !== null && (
            <>
              {' '}Tick {tick} ≈{' '}
              {marketCapForTick(tick).toLocaleString(undefined, { maximumFractionDigits: 0 })} $HOODIE
              {price
                ? ` (≈ $${marketCapUsdForTick(tick, price.priceUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })})`
                : ' (USD unknown — no live price)'}{' '}
              starting market cap. Make sure that is what you want.
            </>
          )}
        </p>
      )}
      {manualTick === '' && tick !== null && price && (
        <p className="muted">
          Starting tick: <span className="mono">{tick}</span> ≈{' '}
          {marketCapForTick(tick).toLocaleString(undefined, { maximumFractionDigits: 0 })} $HOODIE ≈ $
          {marketCapUsdForTick(tick, price.priceUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
          starting market cap.
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
