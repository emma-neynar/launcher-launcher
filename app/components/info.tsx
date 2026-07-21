'use client';

import { DEFAULT_LP_REWARD_BPS, formatPct, grossFeeSplit } from '@/src/fees';
import { HOODIE_ADDRESS } from '@/src/hoodie';
import { DEFAULT_MARKET_CAP_USD } from '@/src/tick';
import { copy } from '../lib/copy';

/**
 * The "more info" view. Every screen in the app stays near-empty because the
 * full explanation — the bit, the rule, the fee math, the fixed opening
 * market cap, the wallet caveat — lives here.
 */
export function Info({ onBack }: { onBack: () => void }) {
  const s = grossFeeSplit(DEFAULT_LP_REWARD_BPS);
  const { bit, rule, fees, mcap, wallet } = copy.info.sections;

  const sections: { h: string; body: string }[] = [
    bit,
    { h: rule.h, body: rule.body(HOODIE_ADDRESS) },
    {
      h: fees.h,
      body: fees.body(formatPct(s.clankerPct), formatPct(s.creatorPct), formatPct(s.launcherPct)),
    },
    { h: mcap.h, body: mcap.body(`$${DEFAULT_MARKET_CAP_USD.toLocaleString()}`) },
    wallet,
  ];

  return (
    <>
      <button className="linkish" onClick={onBack}>
        ← back
      </button>
      <h1 className="meme-caption" style={{ fontSize: 19 }}>
        {copy.info.title}
      </h1>
      {sections.map((sec) => (
        <div key={sec.h} className="card" style={{ marginTop: 10 }}>
          <b style={{ fontSize: 13 }}>{sec.h}</b>
          <p style={{ margin: '6px 0 0', overflowWrap: 'break-word' }}>{sec.body}</p>
        </div>
      ))}
    </>
  );
}
