'use client';

import { useState } from 'react';
import { decodeEventLog } from 'viem';
import { usePublicClient } from 'wagmi';
import { CLANKER_FACTORY, EXPLORER_URL, HOODIE_ADDRESS } from '@/src/hoodie';
import { clankerTokenCreatedEventAbi } from '@/src/wrapper-abi';
import { copy } from '../lib/copy';

export type PairingProof = {
  token: `0x${string}`;
  pairedToken: `0x${string}`;
  poolId: `0x${string}`;
  isHoodie: boolean;
};

/**
 * Decode the Clanker factory's own TokenCreated event out of a transaction
 * receipt — the on-chain proof of which token the pool is paired with.
 */
export function proofFromLogs(
  logs: { address: string; data: `0x${string}`; topics: readonly `0x${string}`[] }[]
): PairingProof | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== CLANKER_FACTORY.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: clankerTokenCreatedEventAbi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      return {
        token: decoded.args.tokenAddress,
        pairedToken: decoded.args.pairedToken,
        poolId: decoded.args.poolId,
        isHoodie: decoded.args.pairedToken.toLowerCase() === HOODIE_ADDRESS.toLowerCase(),
      };
    } catch {
      // not the TokenCreated event; keep scanning
    }
  }
  return null;
}

export function ProofBox({ proof, txHash }: { proof: PairingProof; txHash?: `0x${string}` }) {
  return (
    <div className="card" style={{ marginTop: 12 }}>
      {proof.isHoodie ? (
        <div className="stamp">{copy.verify.verified}</div>
      ) : (
        <p className="error-code" style={{ fontWeight: 700 }}>
          {copy.verify.failed}
        </p>
      )}
      <div className="hint" style={{ marginTop: 8 }}>token</div>
      <div className="mono">
        <a href={`${EXPLORER_URL}/token/${proof.token}`} target="_blank" rel="noreferrer">
          {proof.token}
        </a>
      </div>
      <div className="hint" style={{ marginTop: 8 }}>
        paired token (from the factory&apos;s TokenCreated event)
      </div>
      <div className="mono">{proof.pairedToken}</div>
      <div className="hint" style={{ marginTop: 8 }}>pool ID</div>
      <div className="mono">{proof.poolId}</div>
      {txHash && (
        <div style={{ marginTop: 8 }}>
          <a className="mono" href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer">
            view transaction
          </a>
        </div>
      )}
    </div>
  );
}

/** The Verify view: paste any deploy tx hash and check its pairing on-chain. */
export function VerifyPairing({ onBack }: { onBack: () => void }) {
  const publicClient = usePublicClient();
  const [tx, setTx] = useState('');
  const [proof, setProof] = useState<PairingProof | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    setError('');
    setProof(null);
    try {
      const receipt = await publicClient!.getTransactionReceipt({ hash: tx as `0x${string}` });
      const p = proofFromLogs(receipt.logs);
      if (!p) throw new Error('no Clanker TokenCreated event found in that transaction.');
      setProof(p);
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
        {copy.verify.title}
      </h1>
      <p className="meme-sub">{copy.verify.empty}</p>

      <div className="field">
        <label>{copy.verify.label}</label>
        <input
          className="input mono"
          value={tx}
          onChange={(e) => setTx(e.target.value.trim())}
          placeholder="0x…"
        />
      </div>

      <button className="btn neon" onClick={check} disabled={busy || !tx.startsWith('0x')}>
        {busy ? copy.verify.checking : copy.verify.button}
      </button>

      {error && <p className="error-code">error: {error}</p>}
      {proof && <ProofBox proof={proof} txHash={tx as `0x${string}`} />}
    </>
  );
}
