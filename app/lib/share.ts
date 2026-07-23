'use client';

import { isInFarcasterHost } from './farcaster-identity';
import { copy } from './copy';

/**
 * Share `text` (with `url` as the mini app embed) on the best surface
 * available: Farcaster cast composer → OS share sheet → clipboard.
 *
 * The composer is only attempted INSIDE a Farcaster host — outside one,
 * composeCast hangs instead of rejecting, which read as "the share button
 * does nothing" on the website.
 */
export async function shareText(text: string, url: string, onToast: (msg: string) => void) {
  if (await isInFarcasterHost()) {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      await sdk.actions.composeCast({ text, embeds: [url] });
      return;
    } catch {
      /* host refused the composer — fall through to the web paths */
    }
  }
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      // User closed the share sheet: done. Anything else (blocked,
      // unsupported payload): keep going to the clipboard.
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    onToast(copy.toasts.copied);
  } catch {
    /* clipboard unavailable */
  }
}
