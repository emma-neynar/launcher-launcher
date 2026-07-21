/**
 * The full copy deck for the "yo dawg" brand pass. Strings live here (and only
 * here) so line-edits never touch component code. Source: the creative
 * direction doc §8 — use verbatim unless the owner supplies alternates.
 */

export const copy = {
  connect: {
    captionTop: 'yo dawg, i heard\nyou like launchers',
    captionBottom:
      'so i put a launcher launcher\nin your launcher so you can\nlaunch a launcher while you launch',
    sub: 'everything you make pairs with $HOODIE. house rule. only rule.',
    button: 'plug in, dawg →',
    connecting: 'shaking hands…',
  },

  addChain: {
    title: 'add robinhood\nchain, dawg',
    body: "your wallet's missing robinhood chain (4663). one tap and you're in. on the farcaster app? you're already in, dawg.",
    warn: 'one tap. nothing scary. we promise.',
    button: 'add the chain',
    // Honest fallback when the host wallet genuinely cannot reach 4663
    // (the Farcaster embedded wallet cannot add custom chains).
    blockedBody:
      "the farcaster wallet can't add robinhood chain yet. open this in your browser with metamask or rabby and you're in, dawg.",
    blockedButton: 'copy the link',
  },

  home: {
    header: 'your launchers',
    othersHeader: "everyone else's launchers",
    meta: (n: number, pct: string) =>
      `${n} token${n === 1 ? '' : 's'} launched · you keep ${pct}%`,
    othersMeta: (n: number, pct: string) =>
      `${n} token${n === 1 ? '' : 's'} launched · launcher keeps ${pct}%`,
    pill: '🔒 pairs everything w/ $HOODIE',
    empty: 'no other launchers yet.\nbe the first to put a launcher in your launcher.',
    mineEmpty: 'none yet, dawg. the button below fixes that.',
    loading: 'loading the registry…',
    share: (url: string) => `share: ${url}`,
    button: '+ make a launcher',
    verifyLink: 'prove a launch is 100% hoodie →',
  },

  create: {
    title: 'spin up a launcher',
    sub: "so people can launch launchers off your launcher. yes it's turtles all the way down. no we won't stop.",
    nameLabel: 'name your launcher',
    feeLabel: 'who catches the fees? 💰',
    cutLabel: 'your cut of the LP rewards',
    cutHint: (rest: number) => `the other ${rest}% goes to whoever launches tokens through you`,
    button: 'make it so',
    successToast: 'launcher launched. very meta. 🟢',
  },

  launch: {
    title: 'launch a token',
    nameLabel: 'name',
    tickerLabel: 'ticker',
    mcapLabel: 'opening market cap',
    mcapHint: 'we convert to $HOODIE for you at today’s price',
    pairedLabel: 'paired with',
    locked: '🔒 $HOODIE — not a field, dawg. it’s the whole bit.',
    tooltipTrigger: 'why $HOODIE?',
    tooltip:
      'why $HOODIE? it’s the one immutable rule — every token launched here pairs with it, forever. we couldn’t change it if we wanted to.',
    button: 'review the launch →',
    advanced: 'extra knobs (optional)',
  },

  confirm: {
    title: 'last look',
    body: (ticker: string, mcap: string) =>
      `launching ${ticker}, paired to $HOODIE, on robinhood chain. opens around ${mcap}.`,
    warn: "can't un-launch a token, dawg. this one's forever.",
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
    pairingBody:
      "you tried to swap $HOODIE for another pair. the contract said no. it'll always say no. that's the whole point.",
    pairingCode: 'error: HoodiePairingViolation',
    // Honest variant for everything else (rejected tx, gas, rpc…).
    genericTitle: 'that didn’t launch, dawg',
    genericBody: 'the chain said no this time. nothing was launched — fix it up and send it again.',
    button: 'fine, keep the hoodie',
    genericButton: 'run it back',
  },

  verify: {
    title: 'prove the pairing',
    empty: 'paste a launch transaction and we’ll prove it’s 100% hoodie.',
    label: 'launch transaction hash',
    button: 'verify it, dawg',
    checking: 'checking…',
    verified: 'proven: 100% hoodie',
    failed: 'NOT paired with $HOODIE',
  },

  toasts: {
    txSubmitted: 'sent it. waiting on the chain…',
    copied: 'copied, dawg',
    chainSwitched: 'welcome to robinhood chain, dawg',
  },
} as const;
