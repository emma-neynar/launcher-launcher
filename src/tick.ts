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
 * The tick math itself is denominated in $HOODIE. A USD target is converted
 * first via the live $HOODIE/USD price (see src/hoodie-price.ts for the price
 * source); both tokens are verified 18-decimal so no decimal adjustment.
 */

export const TICK_SPACING = 200;
/** Clanker v4 fixed total supply: 100 billion tokens. */
export const TOTAL_SUPPLY = 100_000_000_000;

/**
 * THE canonical opening tick for every $HOODIE-paired launch shipped by this
 * app. One fixed value, one central constant, so clanker.world can whitelist
 * a single (pairedToken + tick) "expected position" and these launches never
 * look unusual. Print the full position config with:
 *   npm run expected-position
 *
 * Derivation: target the standard Clanker opening market cap
 * (DEFAULT_MARKET_CAP_USD, ~$30k) at $HOODIE's live price. Price source:
 * Dexscreener public API reading the HOODIE/WETH Uniswap v4 pool on Robinhood
 * Chain (src/hoodie-price.ts — also stated in the UI). Calibrated 2026-07-21
 * at $HOODIE ≈ $4.56e-6 → tick -27400 ≈ 6.6B $HOODIE ≈ $30k. The tick is
 * FIXED at build time; the live price is only used for the USD display.
 *
 * TODO(dev answer pending): fixed tick vs a tick RANGE for clanker.world's
 * expected positions. Shipping the fixed default; because every consumer
 * reads this one constant, widening to a range later is a local change.
 */
export const CANONICAL_OPENING_TICK = -27400;

/**
 * Contract fallback tick (must equal Launcher.sol DEFAULT_STARTING_TICK —
 * do not change without redeploying the optional trustless-mode wrapper).
 * Off-chain paths always pass CANONICAL_OPENING_TICK explicitly.
 */
export const DEFAULT_TICK = -27800;

/** Width of the single LP position (matches Launcher.sol POSITION_WIDTH). */
export const POSITION_WIDTH = 110400;
/** Default USD starting market cap target (Clanker standard pools open ~$27-30k). */
export const DEFAULT_MARKET_CAP_USD = 30_000;
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

/** USD market cap -> tick, given the live $HOODIE/USD price. */
export function tickForMarketCapUsd(marketCapUsd: number, hoodiePriceUsd: number): number {
  if (!Number.isFinite(hoodiePriceUsd) || hoodiePriceUsd <= 0) {
    throw new Error('Need a positive $HOODIE/USD price');
  }
  return tickForMarketCap(marketCapUsd / hoodiePriceUsd);
}

/** Tick -> USD market cap, given the live $HOODIE/USD price. */
export function marketCapUsdForTick(tick: number, hoodiePriceUsd: number): number {
  return marketCapForTick(tick) * hoodiePriceUsd;
}
