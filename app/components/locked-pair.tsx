'use client';

import { copy } from '../lib/copy';

/**
 * The pairing display. Deliberately NOT an input: the pair is forced at the
 * config choke point; the UI has no field to change it. The full explanation
 * (address, verification, why) lives in the "how it works" view.
 */
export function LockedPair() {
  return (
    <div className="field">
      <label>{copy.launch.pairedLabel}</label>
      <div className="locked">{copy.launch.locked}</div>
    </div>
  );
}
