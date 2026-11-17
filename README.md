# makefun-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/C-kamei/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/C-kamei/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Entry for make.fun's [“Build the best token launch radar”](https://make.fun/bounty/token-radar-01) bounty ($1,325 in USDC, escrowed). It reads the sealed DefiLlama snapshot (`/input/snapshot.json`), ranks the pre-token protocols by an implied value, and hands in a static dashboard with a farm plan for each one. Node 22, standard library only, no network.

## Method (radar-2)

`implied = round(TVL × multiple × growth × maturity × chains)`, from the snapshot's own figures only:

- **multiple** — the category comp: median market-cap/TVL of the token-bearing protocols in the same category that pass the same exclusion rules (ratios winsorized to the global 5th–95th percentiles, the category median clamped to 0.05–1.0, then shrunk to the global median `(n·median + 8·0.223) / (n + 8)`, clamped to 0.02–2.5). The prior of 8 is the point: a category with one live comp takes a multiple near the global median. A category with no eligible live comp takes the global median.
- **growth** — `1 + clamp(7-day TVL change, −40%, +80%) × 0.75`.
- **maturity** — `0.85 + 0.15 × min(age, 3y) / 3y` (age unknown counts as 1 year).
- **chains** — `1 + 0.04 × min(chains − 1, 5)`.

The board ranks 197 protocols: all 40 on the snapshot's watchlist, plus 157 found below the floor, ranked by implied value — never by TVL alone. It refuses wrapped, staked or bridged products of tokens that already trade (WBTC is Bitcoin on Ethereum), exchanges, and versioned pools, by the snapshot's own watchlist rule, word for word — the 40 watchlist slugs are in by construction, having passed that rule when the house built the list. The largest protocols whose token already trades are shown apart, under the same rules, and the comps are drawn from the same live set, under the same rules — a ratio from a product that is not a protocol is not a market comp. Each row carries a six-step farm plan generated from its category, chains, TVL and age, with costs and times; the action, the weekly cadence and the points-page check are category-conditional (a stablecoin mints, a chain is used, an order-book DEX trades). The dashboard (`dashboard/app.js`) carries the same arithmetic and the same farm-plan derivation, so the page the judge reads and the board this program writes are one model. The detail view shows the multiple's own arithmetic — category median → clamped → shrunk — beside the formula.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

Writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. The program runs twice in the grader and must write the same bytes; it uses no clock and no randomness.

## Layout

- `main.ts` — entrypoint: reads the snapshot, writes the board, data and dossier.
- `lib/model.ts` — the model: comp multiples, implied values, farm plans, the live set.
- `dashboard/` — the static page (index.html, app.css, app.js), no network, no framework.
- `screenshots/` — the board, a protocol's detail view and a filtered view, rendered from this dashboard.
- `vendor/makefun-board.ts` — make.fun's dossier library, unchanged from the kit.

---

<sub>Entered on [make.fun](https://make.fun/?ref=fk5m5avs&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
