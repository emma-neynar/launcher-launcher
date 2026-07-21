/**
 * Regenerates the Mini App branding assets from the source art in
 * public/brand/. Run: node scripts/generate-brand-assets.mjs
 *
 *   icon.png         1024×1024  app-store icon (neon #CCFF00, mascot, wordmark)
 *   splash.png        200×200   splash logo (transparent, over #8A63D2)
 *   embed-image.png  1200×800   3:2 cast embed card (backdrop + caption)
 */
import sharp from 'sharp';

// Icon background is brand neon; the splash screen keeps splashBackgroundColor
// purple (#8a63d2) — set in the manifest route, not here.
const NEON = '#ccff00';
const BRAND = 'public/brand';

// Impact with the same fallback chain as the app CSS. rsvg renders whichever
// is installed; macOS and most CI images have at least Arial Black.
const IMPACT = "Impact, 'Arial Narrow Bold', 'Arial Black', sans-serif";

const memeText = (lines, { x, y, size, anchor = 'middle' }) =>
  lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${y + i * size * 1.06}" text-anchor="${anchor}"
           font-family="${IMPACT}" font-size="${size}" font-weight="400"
           fill="#ffffff" stroke="#000000" stroke-width="${Math.max(2, size / 14)}"
           paint-order="stroke" letter-spacing="1">${line}</text>`
    )
    .join('\n');

const svg = (w, h, inner) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${inner}</svg>`);

async function icon() {
  const mascot = await sharp(`${BRAND}/yo-dawg-transparent.png`)
    .resize(720, 720, { fit: 'inside' })
    .png()
    .toBuffer();
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: NEON } })
    .composite([
      { input: mascot, gravity: 'north', top: 60, left: Math.round((1024 - 720) / 2) },
      { input: svg(1024, 1024, memeText(['YO DAWG'], { x: 512, y: 950, size: 150 })), top: 0, left: 0 },
    ])
    .png()
    .toFile('public/icon.png');
}

async function splash() {
  // Transparent mascot; the host paints splashBackgroundColor behind it.
  await sharp(`${BRAND}/yo-dawg-transparent.png`)
    .resize(200, 200, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile('public/splash.png');
}

async function embed() {
  const backdrop = await sharp(`${BRAND}/backdrop-blue.jpg`)
    .resize(1200, 800, { fit: 'cover' })
    .toBuffer();
  const mascot = await sharp(`${BRAND}/yo-dawg-transparent.png`)
    .resize(340, 340, { fit: 'inside' })
    .png()
    .toBuffer();
  const caption = memeText(['YO DAWG, I HEARD', 'YOU LIKE LAUNCHERS'], { x: 600, y: 110, size: 84 });
  const subCaption = memeText(
    ['SO I PUT A LAUNCHER LAUNCHER', 'IN YOUR LAUNCHER SO YOU CAN LAUNCH', 'A LAUNCHER WHILE YOU LAUNCH'],
    { x: 600, y: 650, size: 42 }
  );
  await sharp(backdrop)
    .composite([
      { input: mascot, top: 250, left: Math.round((1200 - 340) / 2) },
      { input: svg(1200, 800, caption + subCaption), top: 0, left: 0 },
    ])
    .png()
    .toFile('public/embed-image.png');
}

await Promise.all([icon(), splash(), embed()]);
console.log('brand assets written: icon.png, splash.png, embed-image.png');
