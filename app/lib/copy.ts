/**
 * The full copy deck for the "yo dawg" brand pass. Strings live here (and only
 * here) so line-edits never touch component code.
 *
 * Kept deliberately terse: screens carry the minimum, and everything that
 * needs explaining lives in the "how it works" section (copy.info).
 */

// The canonical meme couplet — shared by the connect hero and the connected
// home screen so the two screens can never drift apart.
const CAPTION_TOP = 'yo dawg, i heard\nyou like launchers';
const CAPTION_BOTTOM =
  'so i put a launcher launcher\nin your launcher so you can\nlaunch a launcher while you launch';

export const copy = {
  connect: {
    captionTop: CAPTION_TOP,
    captionBottom: CAPTION_BOTTOM,
    button: 'connect, dawg →',
    connecting: 'shaking hands…',
  },

  addChain: {
    title: 'add robinhood\nchain, dawg',
    body: "your wallet's missing robinhood chain (4663). one tap.",
    button: 'add the chain',
    // Honest fallback when the host wallet genuinely cannot reach 4663
    // (the Farcaster embedded wallet cannot add custom chains).
    blockedBody: "the farcaster wallet can't reach robinhood chain yet. open this in a browser with metamask or rabby.",
    blockedButton: 'copy the link',
  },

  home: {
    // Mascot hero (the connected landing screen) — same couplet as connect.
    captionTop: CAPTION_TOP,
    captionBottom: CAPTION_BOTTOM,
    mineOption: (n?: number) => (n === undefined ? 'your launchers' : `your launchers (${n})`),
    othersOption: (n?: number) =>
      n === undefined ? "everyone else's launchers" : `everyone else's launchers (${n})`,
    tokensOption: (n?: number) => (n === undefined ? 'tokens launched' : `tokens launched (${n})`),
    // List screens.
    header: 'your launchers',
    othersHeader: "everyone else's launchers",
    meta: (n: number) => `${n} token${n === 1 ? '' : 's'} launched`,
    // Creator identity on a launcher card — takes "@username" or a short 0x address.
    creator: (who: string) => `by ${who}`,
    empty: 'no launchers yet.\nbe the first, dawg.',
    mineEmpty: 'none yet. the button below fixes that.',
    loading: 'loading…',
    share: (url: string) => `share: ${url}`,
    pill: '🔒 pairs everything w/ $HOODIE',
    button: '+ make a launcher',
    verifyLink: 'verify a launch →',
    infoLink: 'how it works →',
  },

  // The cross-launcher "tokens launched" list screen.
  tokens: {
    header: 'tokens launched',
    empty: 'nothing launched yet.\nyour move, dawg.',
    // Who signed the launch — takes "@username"; anon when the launch predates
    // identity capture (or came from outside the mini app).
    launchedBy: (who: string) => `launched by ${who}`,
    anon: 'launched by anon',
    via: (launcherName: string) => `via ${launcherName}`,
  },

  create: {
    title: 'spin up a launcher',
    nameLabel: 'name your launcher',
    // The ONE knob (lpRewardBps as a %). Everything else is forced.
    cutLabel: 'your cut of the reward pool 💰',
    cutHint: (max: number) => `0–${max}%. the only knob.`,
    feeRecipientNote: (addr: string) => `pays out to ${addr}`,
    button: 'make it so',
    successToast: 'launcher launched. very meta. 🟢',
  },

  // Gross fee split — of ALL LP fees a pool earns, wallet-accurate. Clanker's
  // documented 20% protocol fee is ALWAYS an explicit line item (src/fees.ts).
  fees: {
    header: 'who gets the fees',
    clankerLine: (pct: string) => `clanker protocol · ${pct}% (fixed)`,
    creatorLine: (pct: string) => `token creator · ${pct}%`,
    launcherLine: (pct: string) => `launcher operator · ${pct}%`,
    compact: (clanker: string, creator: string, launcher: string) =>
      `fees: clanker ${clanker}% · creator ${creator}% · launcher ${launcher}%`,
  },

  launch: {
    title: 'launch a token',
    nameLabel: 'name',
    tickerLabel: 'ticker',
    mcapLabel: 'opening market cap',
    // The opening tick is fixed (CANONICAL_OPENING_TICK, src/tick.ts) so
    // clanker.world can whitelist one expected position. Not user-editable.
    mcapLocked: (usd: string) => `≈ ${usd} — same for every launch`,
    pairedLabel: 'paired with',
    locked: '🔒 $HOODIE — not a field, dawg.',
    button: 'review the launch →',
    advanced: 'extra details (optional)',
  },

  confirm: {
    title: 'last look',
    body: (ticker: string, mcap: string) =>
      `launching ${ticker}, paired to $HOODIE, on robinhood chain. opens around ${mcap}.`,
    warn: "can't un-launch a token, dawg.",
    cancel: 'wait, no',
    confirm: 'send it 🚀',
  },

  launching: {
    lines: [
      'putting a launcher in your launcher…',
      'reticulating recursion…',
      'asking the contract nicely…',
      'pairing you with $HOODIE…',
      'it’s launchers all the way down…',
    ],
    status: 'confirming on robinhood chain…',
    // Shown while we scan recent factory logs after the wallet went quiet —
    // the host wallet sometimes broadcasts but never returns the hash.
    recovering: 'no word from your wallet — checking if it landed anyway…',
    viewTx: 'watch it on the explorer →',
  },

  // The honest "still pending" screen: the receipt didn't arrive within the
  // bounded wait, so we show the hash instead of spinning forever.
  pending: {
    title: 'still cooking, dawg',
    body: "the chain hasn't confirmed your launch yet. slow isn't dead — here's the receipt.",
    txLabel: 'your transaction',
    hint: 'we keep watching — this flips to success the moment it lands. or check the explorer yourself.',
    dismiss: 'back to the launchers',
  },

  success: {
    title: 'it launched.\nwhile you launched.',
    stamp: 'proven: 100% hoodie',
    tokenLabel: 'token',
    pairedLabel: 'paired',
    pairedValue: '🔒 $HOODIE (verified on-chain)',
    button: 'share the bit →',
    shareCast: (url: string) =>
      `yo dawg. i put a launcher launcher in my launcher and launched a token paired to $HOODIE — immutable, proven on-chain, on robinhood chain. put a launcher in your launcher → ${url}`,
  },

  error: {
    title: 'nice try, dawg',
    // For actual pairing violations — the whole bit.
    pairingBody: "you tried to ditch $HOODIE. the contract said no. it always says no.",
    pairingCode: 'error: HoodiePairingViolation',
    // Honest variant for everything else (rejected tx, gas, rpc…).
    genericTitle: 'that didn’t launch, dawg',
    genericBody: 'the chain said no. nothing was launched — run it back.',
    // The wallet never returned a tx hash (seen with the farcaster host wallet
    // on chains it can't fully reach) — distinct from an on-chain failure.
    walletTimeoutTitle: 'your wallet ghosted, dawg',
    walletTimeoutBody:
      'we never got a transaction hash back from your wallet, so nothing was launched. if this keeps happening in farcaster, open the app in a browser with metamask or rabby.',
    // Thrown pre-send when the connected wallet isn't on chain 4663.
    wrongChain: 'your wallet drifted off robinhood chain (4663) — reconnect and run it back.',
    button: 'fine, keep the hoodie',
    genericButton: 'run it back',
  },

  verify: {
    title: 'prove the pairing',
    empty: 'paste a launch tx hash.',
    label: 'launch transaction hash',
    button: 'verify it, dawg',
    checking: 'checking…',
    verified: 'proven: 100% hoodie',
    failed: 'NOT paired with $HOODIE',
  },

  // The "more info" section — ALL the explanation lives here so the screens
  // themselves can stay near-empty.
  info: {
    title: 'how it works',
    sections: {
      bit: {
        h: 'the bit',
        body: 'you spin up a launcher. other people launch tokens through it. you skim a cut of the fees. yes, it’s a launcher launcher. recursion is the point.',
      },
      rule: {
        h: 'the rule',
        body: (addr: string) =>
          `every token launched here is paired with $HOODIE (${addr}) on robinhood chain. the pairing is written into the deploy call and re-checked in the encoded transaction before your wallet signs — there is no field to change it. any launch can be verified from the home screen: we decode the clanker factory’s own TokenCreated event straight off the chain.`,
      },
      fees: {
        h: 'the fees',
        body: (clanker: string, creator: string, launcher: string) =>
          `of every swap fee a pool earns: the clanker protocol keeps ${clanker}% (fixed, documented). the remaining 80% splits between the token creator and the launcher operator — the operator’s cut is the one thing a launcher’s creator chooses. at the default that lands at ${creator}% creator / ${launcher}% launcher. all numbers shown in this app are gross, nothing hidden.`,
      },
      mcap: {
        h: 'the opening market cap',
        body: (usd: string) =>
          `every token opens at the same standard tick — about ${usd} market cap, converted to $HOODIE at the live price (Dexscreener, HOODIE/WETH pool). one standard opening keeps every pool shaped the same, so launches from here don’t get flagged as unusual.`,
      },
      wallet: {
        h: 'wallets + chain',
        body: 'everything runs on robinhood chain (4663), signed by your own wallet — this app never holds keys or funds. metamask or rabby in a browser works best; the farcaster in-app wallet can’t reach 4663 yet, so inside farcaster you’ll get a link to open in your browser instead.',
      },
    },
  },

  toasts: {
    txSubmitted: 'sent it. waiting on the chain…',
    copied: 'copied, dawg',
    chainSwitched: 'welcome to robinhood chain, dawg',
    registryFailed: "token's live on-chain, but the registry didn't hear about it. still counts.",
  },
} as const;
