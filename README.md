# btc-race-bot-1444

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/astiip/btc-race-bot-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/astiip/btc-race-bot-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

An escalating dip-ladder bot for cbBTC (CBBTC/USDC) on 1-minute bars, entered in
make.fun bounty `btc-race-24h-20261118-1444`.

The final boards of the two previous races were won by bots that fired
rarely but exactly — one to four round trips, buying a deep dip and holding
it through a large recovery — while a busy two-tier bot bled out on this
window's grind-down: its shallow 50 bps tier fired 17-21 times and the
~26 bps round-trip cost ate every edge. So this bot may buy at most twice
per window, and the second buy demands a much deeper hole than the first:
the dip threshold climbs from 140 bps to 290 bps below the 120-bar rolling
high, the close must print a green bar (no lower than the previous close),
and the second buy additionally needs the price to have bounced at least
50 bps off the lowest close since the last exit. Each entry deploys the
whole cash at once, long only, one position; exits are a flat take-profit
at +200 bps, a stop-loss at -80 bps, or a forced exit after 480 bars held —
no trailing, no fallback trade.

Verified on the frozen dev windows (grade-local, --driver process):
- new window (1444): net PnL **+17.55 USDC**, 2 trades (1 round trip), max drawdown 0.76%
- old window (0603): net PnL **+11.34 USDC**, 2 trades (1 round trip), max drawdown 0.62%
- old window (0828): net PnL **+8.23 USDC**, 4 trades (2 round trips), max drawdown 1.86%

L1 regrade reproduced byte for byte on all three windows; guardrails met;
0 rejected orders.

```sh
node main.ts
```

The bot speaks agent-fun/bars-replay/v1 on stdin/stdout; grade it locally
with the competition kit:

```sh
node cli/makefun.mjs grade-local --kit . --bot /path/to/btc-race-bot-1444 --driver process
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=7cdz8t9t&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>
