/**
 * One-shot: turn the supplied mascot art (subject on an opaque pure-black
 * background) into public/brand/yo-dawg-transparent.png.
 *
 * The background is exactly (0,0,0) while interior darks (shirt ~3-9,
 * drawstring tassel ~20-28, hood shadows ~30-45) are near-black but not pure
 * black, so we:
 *   1. BFS flood-fill seeded from the four corners with a very strict
 *      tolerance, so only true background pixels go transparent. (Seeding
 *      every border pixel would leak into the black shirt, which touches
 *      the bottom edge of the canvas.)
 *   2. Run a bounded fringe pass: a couple of dilation steps that eat the
 *      anti-aliased dark halo directly bordering the background, without
 *      being able to crawl deep into the subject.
 *   3. Fill enclosed holes: any transparent region not connected to the
 *      image border is restored to opaque.
 *   4. Feather the alpha edge with a 3x3 blur to avoid crunchy outlines.
 *
 * Usage: node scripts/cutout-mascot.mjs <input.png>
 */
import sharp from 'sharp';

const input = process.argv[2];
if (!input) throw new Error('usage: node scripts/cutout-mascot.mjs <input.png>');

const FLOOD_TOL = 2; // max channel value treated as true background
const FRINGE_TOL = 30; // max channel value eligible for the halo fringe pass
const FRINGE_STEPS = 2; // how far (px) the fringe pass may advance from true bg

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;
const n = w * h;

const maxCh = (p) => Math.max(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);

// transparent[p] = 1 means this pixel becomes background
const transparent = new Uint8Array(n);

// --- 1. strict flood fill from the corners ---------------------------------
{
  const queue = [0, w - 1, (h - 1) * w, h * w - 1];
  const visited = new Uint8Array(n);
  while (queue.length) {
    const p = queue.pop();
    if (visited[p]) continue;
    visited[p] = 1;
    if (maxCh(p) > FLOOD_TOL) continue;
    transparent[p] = 1;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) queue.push(p - 1);
    if (x < w - 1) queue.push(p + 1);
    if (y > 0) queue.push(p - w);
    if (y < h - 1) queue.push(p + w);
  }
}

// --- 2. bounded fringe pass: absorb the dark anti-alias halo --------------
for (let step = 0; step < FRINGE_STEPS; step++) {
  const grow = [];
  for (let p = 0; p < n; p++) {
    if (transparent[p] || maxCh(p) > FRINGE_TOL) continue;
    const x = p % w;
    const y = (p / w) | 0;
    if (
      (x > 0 && transparent[p - 1]) ||
      (x < w - 1 && transparent[p + 1]) ||
      (y > 0 && transparent[p - w]) ||
      (y < h - 1 && transparent[p + w])
    ) {
      grow.push(p);
    }
  }
  for (const p of grow) transparent[p] = 1;
}

// --- 3. fill enclosed holes: keep only border-connected transparency ------
{
  const keep = new Uint8Array(n);
  const queue = [];
  for (let x = 0; x < w; x++) queue.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) queue.push(y * w, y * w + (w - 1));
  while (queue.length) {
    const p = queue.pop();
    if (keep[p] || !transparent[p]) continue;
    keep[p] = 1;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) queue.push(p - 1);
    if (x < w - 1) queue.push(p + 1);
    if (y > 0) queue.push(p - w);
    if (y < h - 1) queue.push(p + w);
  }
  transparent.set(keep);
}

// --- 4. write alpha with a 1px feather ------------------------------------
const alpha = new Uint8Array(n);
for (let p = 0; p < n; p++) alpha[p] = transparent[p] ? 0 : 255;

for (let p = 0; p < n; p++) {
  const x = p % w;
  const y = (p / w) | 0;
  let sum = 0;
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      sum += alpha[ny * w + nx];
      count++;
    }
  }
  data[p * 4 + 3] = Math.round(sum / count);
}

await sharp(data, { raw: { width: w, height: h, channels: 4 } })
  .png()
  .toFile('public/brand/yo-dawg-transparent.png');
console.log('wrote public/brand/yo-dawg-transparent.png');
