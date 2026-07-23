'use client';

import { isInFarcasterHost } from './farcaster-identity';
import { copy } from './copy';

/**
 * Share on the best surface available. Inside a Farcaster host: the cast
 * composer, prefilled with `text` and the deep link as a mini app embed.
 * Anywhere else (the website): copy the LINK itself to the clipboard — a
 * plain URL pastes cleanly into wherever the conversation is happening.
 *
 * The composer is only attempted INSIDE a host — outside one, composeCast
 * hangs instead of rejecting, which read as "the share button does nothing".
 */
export async function shareText(text: string, url: string, onToast: (msg: string) => void) {
  if (await isInFarcasterHost()) {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      await sdk.actions.composeCast({ text, embeds: [url] });
      return;
    } catch {
      /* host refused the composer — fall through to the clipboard */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    onToast(copy.toasts.linkCopied);
  } catch {
    /* clipboard unavailable */
  }
}
