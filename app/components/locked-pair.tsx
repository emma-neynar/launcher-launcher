'use client';

import { useState } from 'react';
import { HOODIE_ADDRESS } from '@/src/hoodie';
import { copy } from '../lib/copy';

/**
 * The pairing display. Deliberately NOT an input: the pair is a constant in
 * the Launcher contract itself; the UI has no field to change it.
 */
export function LockedPair() {
  const [showWhy, setShowWhy] = useState(false);

  return (
    <div className="field">
      <label>{copy.launch.pairedLabel}</label>
      <div className="locked">{copy.launch.locked}</div>
      <div className="mono" style={{ marginTop: 4 }}>
        {HOODIE_ADDRESS}
      </div>
      <button className="linkish" onClick={() => setShowWhy((v) => !v)}>
        {copy.launch.tooltipTrigger}
      </button>
      {showWhy && <div className="tooltip-box">{copy.launch.tooltip}</div>}
    </div>
  );
}
