'use client';

import { useState } from 'react';
import { decodeEventLog } from 'viem';
import { usePublicClient } from 'wagmi';
import { CLANKER_FACTORY, EXPLORER_URL, HOODIE_ADDRESS } from '@/src/hoodie';
import { clankerTokenCreatedEventAbi } from '@/src/wrapper-abi';

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
    <div className="verify-box">
      <div className={proof.isHoodie ? 'success' : 'error'} style={{ fontWeight: 600 }}>
        {proof.isHoodie ? 'VERIFIED: paired with $HOODIE' : 'NOT PAIRED WITH $HOODIE'}
      </div>
      <div className="muted" style={{ marginTop: 6 }}>Token</div>
      <div className="mono">
        <a href={`${EXPLORER_URL}/token/${proof.token}`} target="_blank" rel="noreferrer">
          {proof.token}
        </a>
      </div>
      <div className="muted" style={{ marginTop: 6 }}>Paired token (from the factory&apos;s TokenCreated event)</div>
      <div className="mono">{proof.pairedToken}</div>
      <div className="muted" style={{ marginTop: 6 }}>Pool ID</div>
      <div className="mono">{proof.poolId}</div>
      {txHash && (
        <div style={{ marginTop: 6 }}>
          <a className="mono" href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer">
            View transaction
          </a>
        </div>
      )}
    </div>
  );
}

/** Standalone verifier: paste any deploy tx hash and check its pairing. */
export function VerifyPairing() {
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
      if (!p) throw new Error('No Clanker TokenCreated event found in that transaction.');
      setProof(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Verify $HOODIE pairing</h2>
      <p className="muted">
        Paste any launch transaction hash. We decode the Clanker factory&apos;s TokenCreated event
        directly from the chain — no trust in this UI required.
      </p>
      <label>Transaction hash</label>
      <input value={tx} onChange={(e) => setTx(e.target.value.trim())} placeholder="0x…" />
      <button onClick={check} disabled={busy || !tx.startsWith('0x')}>
        {busy ? 'Checking…' : 'Verify'}
      </button>
      {error && <p className="error">{error}</p>}
      {proof && <ProofBox proof={proof} txHash={tx as `0x${string}`} />}
    </div>
  );
}
