/**
 * Market cap <-> initial tick math for a $HOODIE-paired Clanker v4 pool.
 *
 * Uniswap v3/v4 price at tick t is 1.0001^t (token1 per token0). The Clanker
 * factory takes `tickIfToken0IsClanker`, i.e. the price of the NEW token
 * denominated in the paired token ($HOODIE). Both the new token and $HOODIE
 * have 18 decimals (verified on-chain), so no decimal adjustment is needed:
 *
 *   price(HOODIE per token) = marketCapInHoodie / TOTAL_SUPPLY
 *   tick = floor( ln(price) / ln(1.0001) / TICK_SPACING ) * TICK_SPACING
 *
 * NOTE: the market cap here is denominated in $HOODIE, not USD. Converting a
 * USD target requires the current $HOODIE/USD price (external feed) — that is
 * deliberately out of scope; the UI labels the input in $HOODIE.
 */

export const TICK_SPACING = 200;
/** Clanker v4 fixed total supply: 100 billion tokens. */
export const TOTAL_SUPPLY = 100_000_000_000;
/** SDK default (~10 HOODIE market cap). */
export const DEFAULT_TICK = -230400;
/** Uniswap v4 usable tick bounds (rounded to spacing). */
export const MIN_TICK = -887200;
export const MAX_TICK = 887200;

export function tickForMarketCap(marketCapHoodie: number): number {
  if (!Number.isFinite(marketCapHoodie) || marketCapHoodie <= 0) {
    throw new Error('Market cap must be a positive number of $HOODIE');
  }
  const price = marketCapHoodie / TOTAL_SUPPLY;
  const rawTick = Math.log(price) / Math.log(1.0001);
  const tick = Math.floor(rawTick / TICK_SPACING) * TICK_SPACING;
  if (tick < MIN_TICK || tick > MAX_TICK) {
    throw new Error(`Market cap out of range (computed tick ${tick})`);
  }
  return tick;
}

export function marketCapForTick(tick: number): number {
  return 1.0001 ** tick * TOTAL_SUPPLY;
}
