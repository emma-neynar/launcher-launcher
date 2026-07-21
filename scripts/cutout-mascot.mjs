/**
 * One-shot: turn the supplied mascot art (subject on an opaque black
 * background) into public/brand/yo-dawg-transparent.png. Only background
 * pixels REACHABLE FROM THE IMAGE EDGES are made transparent (BFS flood
 * fill), so black areas inside the subject — shirt, hoodie trim — survive.
 *
 * Usage: node scripts/cutout-mascot.mjs <input.png>
 */
import sharp from 'sharp';

const input = process.argv[2];
if (!input) throw new Error('usage: node scripts/cutout-mascot.mjs <input.png>');

const NEAR_BLACK = 30; // max channel value still considered background

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;

const isBg = (i) => data[i] <= NEAR_BLACK && data[i + 1] <= NEAR_BLACK && data[i + 2] <= NEAR_BLACK;

const visited = new Uint8Array(w * h);
const queue = [];
for (let x = 0; x < w; x++) {
  queue.push(x, (h - 1) * w + x);
}
for (let y = 0; y < h; y++) {
  queue.push(y * w, y * w + (w - 1));
}

while (queue.length) {
  const p = queue.pop();
  if (visited[p]) continue;
  visited[p] = 1;
  if (!isBg(p * 4)) continue;
  data[p * 4 + 3] = 0;
  const x = p % w;
  const y = (p / w) | 0;
  if (x > 0) queue.push(p - 1);
  if (x < w - 1) queue.push(p + 1);
  if (y > 0) queue.push(p - w);
  if (y < h - 1) queue.push(p + w);
}

await sharp(data, { raw: { width: w, height: h, channels: 4 } })
  .png()
  .toFile('public/brand/yo-dawg-transparent.png');
console.log('wrote public/brand/yo-dawg-transparent.png');
