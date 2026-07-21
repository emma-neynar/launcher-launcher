'use client';

import { HOODIE_ADDRESS } from '@/src/hoodie';

/**
 * The pairing display. Deliberately NOT an input: the pair is a constant in
 * the Launcher contract itself; the UI has no field to change it.
 */
export function LockedPair() {
  return (
    <div className="locked-pair">
      <span className="lock-icon" aria-hidden>
        🔒
      </span>
      <div>
        <div>
          Paired token: <strong>$HOODIE</strong> — locked at the contract level
        </div>
        <div className="mono muted">{HOODIE_ADDRESS}</div>
      </div>
    </div>
  );
}
