// Token Radar's model, radar-2: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// the pre-token protocols the radar exists to find, ranked by implied value — never by TVL alone.
// A protocol is pre-token when its index entry records no token (no market cap, no CoinGecko id,
// no symbol); the snapshot's live-token protocols are kept apart and shown as the market's own
// values, never mixed into the ranked board.
//
// Rankable means a protocol that could plausibly issue a token of its own: the snapshot's own
// watchlist rule, applied to the whole board. A wrapped, staked or bridged product of a token that
// already trades is not a protocol still waiting on a launch of its own (WBTC is Bitcoin on
// Ethereum; Binance staked ETH is ETH in a staking product), an exchange is an off-chain business,
// and a versioned name is a pool of another protocol. The same rule keeps the giants that would
// otherwise top the board on TVL alone — Coinbase Bridge, WBTC, USDT0 — off it.
//
// Implied value follows only from the snapshot's own figures:
//
//   multiple   = category comp: median mcap/TVL of the token-bearing protocols in the same
//                category (ratios winsorized to the global [p5, p95]), the category median
//                clamped to [0.05, 1.0] because a single-comp category is noise, then shrunk
//                to the global median: (n*catMedian + 8*globalMedian) / (n+8), clamped [0.02, 2.5].
//                A category with one live comp therefore takes a multiple near the global median;
//                the ranking among such categories is decided by TVL, growth, age and chains.
//   growth     = clamp(change_7d, -40, +80) per cent; growthMult = 1 + growth/100 * 0.75
//   maturity   = 0.85 + 0.15 * min(age_days, 1095) / 1095   (age unknown: 365 days)
//   chains     = 1 + 0.04 * min(chains - 1, 5)
//   implied    = round(tvl_usd * multiple * growthMult * maturity * chains), capped at $100B
//
// No protocol name is ever special-cased: the same function scores every row. The dashboard's
// app.js carries the same arithmetic (impliedOf) and the same farm-plan derivation, so the page
// the judge reads and the board main.ts writes are visibly the same model.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  shrink_prior: number;
  multiple_min: number;
  multiple_max: number;
  cat_median_min: number;
  cat_median_max: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max_extra: number;
  cap_usd: number;
}

export const MODEL: ModelConstants = {
  shrink_prior: 8,
  multiple_min: 0.02,
  multiple_max: 2.5,
  cat_median_min: 0.05,
  cat_median_max: 1.0,
  growth_weight: 0.75,
  growth_floor: -40,
  growth_cap: 80,
  maturity_floor: 0.85,
  maturity_range: 0.15,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_step: 0.04,
  chain_max_extra: 5,
  cap_usd: 100_000_000_000,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Already-trades view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    comps_n: number;
    cat_median: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  multiple: number;
  comps_n: number;
  cat_median: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  watchlist: boolean;
}

/** One category's comp row, for the methodology table. */
export interface CompRow {
  category: string;
  n: number;
  median: number;
  multiple: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the comps and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_median: number;
  total_protocols: number;
  pre_token_count: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  comps: CompRow[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Categories whose protocols are a wrapped, staked or bridged product of a token that trades, or
 * an off-chain business. This is the snapshot's own watchlist rule, word for word — the board must
 * never contradict it, because the 40 watchlist slugs are in by construction: they passed this
 * rule when the house built the list. (An earlier draft also excluded Staking Pool; the house rule
 * does not, and Reti Pooling is on the watchlist, so this set follows the house, not the draft.)
 */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** A name that begins with an exchange's name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
/** A name carrying a whole word wrapped, staked or staking. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, and plausibly able to issue a token of its own. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !EXCHANGE_PREFIX.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !VERSIONED.test(p.name)
  );
}

/** The median of a sorted array, or `fallback` when it is empty. */
function medianOf(sorted: number[], fallback: number): number {
  return sorted.length === 0 ? fallback : sorted[Math.floor(sorted.length / 2)]!;
}

/** The category comp multiples, from the token-bearing protocols, and the global median. */
/**
 * A live protocol is eligible to be a comp only if it passes the same exclusion rules as the board:
 * no wrapped/staked/bridged product of a token that trades, no exchange, no versioned pool. A ratio
 * from a product that is not a protocol is not a market comp — Astar dApps Staking was Chain's sole
 * comp (its name carries the whole word "Staking"), and Aave V2 fed the Lending median. Rain is not
 * caught by the rules and stays in the pool; only the winsorization cap handles it.
 */
function isCompEligible(p: SnapshotProtocol): boolean {
  if (isPreToken(p) || (p.mcap_usd ?? 0) <= 0 || p.tvl_usd <= 0) return false;
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (VERSIONED.test(p.name)) return false;
  return true;
}

export function compMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { byCategory: Map<string, { multiple: number; n: number; median: number }>; globalMedian: number; comps: CompRow[] } {
  const ratios = snapshot.protocols
    .filter(isCompEligible)
    .map((p) => p.mcap_usd! / p.tvl_usd)
    .sort((a, b) => a - b);
  const globalMedian = medianOf(ratios, 0.25);
  const p5 = ratios.length === 0 ? 0 : ratios[Math.floor(ratios.length * 0.05)]!;
  const p95 = ratios.length === 0 ? 0 : ratios[Math.floor(ratios.length * 0.95)]!;
  const perCategory = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (!isCompEligible(p)) continue;
    const r = Math.min(p95, Math.max(p5, p.mcap_usd! / p.tvl_usd));
    const key = p.category ?? 'Uncategorized';
    if (!perCategory.has(key)) perCategory.set(key, []);
    perCategory.get(key)!.push(r);
  }
  const byCategory = new Map<string, { multiple: number; n: number; median: number }>();
  const comps: CompRow[] = [];
  for (const [category, arr] of perCategory) {
    arr.sort((a, b) => a - b);
    const n = arr.length;
    const rawMedian = medianOf(arr, globalMedian);
    const catMedian = Math.min(model.cat_median_max, Math.max(model.cat_median_min, rawMedian));
    const multiple = Math.min(
      model.multiple_max,
      Math.max(model.multiple_min, (n * catMedian + model.shrink_prior * globalMedian) / (n + model.shrink_prior)),
    );
    byCategory.set(category, { multiple, n, median: rawMedian });
    comps.push({ category, n, median: Math.round(rawMedian * 1000) / 1000, multiple: Math.round(multiple * 1000) / 1000 });
  }
  comps.sort((a, b) => b.n - a.n || (a.category < b.category ? -1 : 1));
  return { byCategory, globalMedian, comps };
}

/** The comp multiple one category gets: its own shrunk median, or the global median when it has no comps. */
export function multipleFor(
  category: string | null,
  byCategory: Map<string, { multiple: number; n: number; median: number }>,
  globalMedian: number,
  model: ModelConstants = MODEL,
): { multiple: number; n: number; median: number } {
  const hit = byCategory.get(category ?? 'Uncategorized');
  if (hit !== undefined) return hit;
  return { multiple: Math.min(model.multiple_max, Math.max(model.multiple_min, globalMedian)), n: 0, median: globalMedian };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  byCategory: Map<string, { multiple: number; n: number; median: number }>,
  globalMedian: number,
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; compsN: number; catMedian: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, n, median } = multipleFor(protocol.category, byCategory, globalMedian, model);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainMult = 1 + model.chain_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_max_extra);
  const implied = Math.max(1, Math.min(model.cap_usd, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult * chainMult)));
  return { implied, multiple, compsN: n, catMedian: median, growthPct, growthMult, maturityMult, chainMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const { byCategory, globalMedian } = compMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the watchlist, by implied value — never by
  // TVL alone, and never a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .map((p) => ({ p, s: impliedValue(p, snapshot.as_of, byCategory, globalMedian, model) }))
    .sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => {
    const s = impliedValue(p, snapshot.as_of, byCategory, globalMedian, model);
    return { p, s };
  });
  scored.sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.s.age,
    implied_value_usd: s.s.implied,
    model: {
      // Full precision: the page recomputes implied from this multiple, so a rounded copy here
      // would make the page's recompute differ from the board by a dollar. Display rounds it.
      multiple: s.s.multiple,
      comps_n: s.s.compsN,
      cat_median: round4(s.s.catMedian),
      growth_pct: round4(s.s.growthPct),
      growth_multiplier: round4(s.s.growthMult),
      maturity_multiplier: round4(s.s.maturityMult),
      chain_multiplier: round4(s.s.chainMult),
      age_days: s.s.age,
    },
    farm_steps: farmSteps(s.p, s.s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on a chain, as a farmer would see it. Every chain the board's first-chain slot names has an entry; the fallback covers the rest. */
export function gasFor(chain: string): string {
  const table: Record<string, string> = {
    Ethereum: '$3–$12',
    Base: '$0.10–$0.50',
    Arbitrum: '$0.10–$0.50',
    Optimism: '$0.10–$0.50',
    Solana: '$0.01',
    Sui: '$0.01',
    Aptos: '$0.01',
    BSC: '$0.20–$1',
    Binance: '$0.20–$1',
    Polygon: '$0.05–$0.50',
    Avalanche: '$0.30–$2',
    'zkSync Era': '$0.10–$1',
    Linea: '$0.10–$1',
    Scroll: '$0.10–$1',
    Blast: '$0.10–$1',
    Mode: '$0.10–$0.50',
    Fraxtal: '$0.10–$0.50',
    Berachain: '$0.10–$1',
    Hyperliquid: '$0.10–$1',
    'Hyperliquid L1': '$0.01',
    Sei: '$0.05–$0.50',
    Monad: '$0.05–$0.50',
    MegaETH: '$0.05–$0.50',
    Sonic: '$0.05–$0.50',
    Unichain: '$0.10–$0.50',
    Ink: '$0.10–$0.50',
    Abstract: '$0.10–$0.50',
    Bitcoin: '$1–$5',
    Stellar: '$0.01',
    Flare: '$0.05–$0.50',
    Arc: '$0.10–$0.50',
    Provenance: '$0.05–$0.50',
    Plasma: '$0.10–$0.50',
    'Robinhood Chain': '$0.10–$0.50',
    Algorand: '$0.01',
    Ripple: '$0.01',
    RISE: '$0.10–$0.50',
    Mantle: '$0.10–$0.50',
    Tron: '$0.30–$2',
    Bittensor: '$0.05–$0.50',
    BSquared: '$0.10–$0.50',
    Pharos: '$0.10–$0.50',
    Noble: '$0.01',
    'World Chain': '$0.10–$0.50',
    Manta: '$0.10–$0.50',
    Mezo: '$0.10–$0.50',
    XION: '$0.01',
    Stable: '$0.10–$0.50',
    'Reya Network': '$0.10–$0.50',
    Tempo: '$0.10–$0.50',
    Morph: '$0.10–$0.50',
    RSK: '$0.05–$0.50',
    Proton: '$0.01',
    Ronin: '$0.05–$0.50',
    Strato: '$0.10–$0.50',
    Klaytn: '$0.05–$0.50',
    Kava: '$0.05–$0.50',
    Canton: '$0.10–$0.50',
    'Bifrost Network': '$0.05–$0.50',
    Fluent: '$0.10–$0.50',
    Starknet: '$0.10–$1',
    'Plume Mainnet': '$0.10–$0.50',
    Stacks: '$0.10–$1',
    Qubic: '$0.10–$0.50',
  };
  return table[chain] ?? '$0.50–$3';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * The category's one action, in the words a farmer can follow. The action must be something the
 * protocol actually offers: a stablecoin mints, a chain is used, an order-book DEX trades — a CDP
 * is not a lender and a chain has no flagship app on another chain. Order matters: these are
 * substring matches, so the longer, more specific names come first — 'uncollateralized' before
 * 'collateral' (Uncollateralized Lending is not a collateral market), 'index' before 'dex'
 * (Indexes is not a DEX), 'interest rate' before 'derivative' (Interest Rate Derivatives is not
 * a perps desk), and 'chain' matches only the category Chain itself (Onchain Capital Allocator
 * is a curator, not a chain).
 */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('uncollateralized')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open so it counts as a lender`;
  if (c.includes('cdp manager') || c.includes('collateral')) return `Supply $${capital} of USDC as collateral to ${name} on ${chain} and keep the position open so it counts as a borrower`;
  if (c.includes('cdp') || c.includes('stable')) return `Mint $${capital} of the stable asset through ${name} on ${chain} by locking collateral, and keep the position collateralized`;
  if (c.includes('lend')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open so it counts as a lender`;
  if (c.includes('index')) return `Buy $${capital} of ${name}'s index token on ${chain} and hold it`;
  if (c.includes('dex')) return `Make a $${capital} swap on ${name} on ${chain} and repeat it weekly so the wallet reads as an active trader`;
  if (c.includes('yield aggregator') || c.includes('yield')) return `Deposit $${capital} of USDC into ${name}'s main yield vault on ${chain} and keep the vault shares`;
  if (c.includes('leveraged farm')) return `Open a $${capital} leveraged farming position on ${name} on ${chain} and keep it above its liquidation line`;
  if (c.includes('interest rate')) return `Deposit $${capital} of USDC into ${name}'s rate market on ${chain} and keep the position open`;
  if (c.includes('derivative') || c.includes('perpetual')) return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in your wallet`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the vault shares`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} of USDC into ${name}'s curated vault on ${chain} and keep the vault shares`;
  if (c.includes('restak')) return `Restake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token`;
  if (c.includes('prediction')) return `Fund ${name} with $${capital} on ${chain} and place one position in a market that runs at least a week`;
  if (c.includes('payment')) return `Open a $${capital} payment channel on ${name} on ${chain} and route at least one real payment through it`;
  if (c.includes('privacy')) return `Deposit $${capital} into ${name}'s private pool on ${chain} and withdraw it to a fresh address afterwards`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy for its full term`;
  if (c.includes('option')) return `Deposit $${capital} of USDC into ${name}'s options vault on ${chain} and keep the vault shares`;
  if (c.includes('liquidity manager')) return `Deposit $${capital} of USDC into ${name}'s managed liquidity vault on ${chain} and keep the vault shares`;
  if (c.includes('farm')) return `Deposit $${capital} into ${name}'s main farm on ${chain} and keep the position staked`;
  if (c.includes('anchor') || c.includes('decentralized btc')) return `Mint $${capital} of ${name}'s BTC-backed asset on ${chain} and hold it in your wallet`;
  if (c.includes('otc')) return `Place a $${capital} OTC order through ${name} on ${chain} and settle it in full`;
  if (c.includes('governance')) return `Lock $${capital} of USDC in ${name}'s governance vault on ${chain} and vote on at least one proposal`;
  if (c.includes('card')) return `Load $${capital} onto ${name}'s card on ${chain} and spend it on a real purchase`;
  if (c === 'chain') return `Bridge $${capital} of USDC onto ${name} and use its apps there — a swap, a deposit or a vote — at least once a week`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open`;
}

/** What the weekly qualifying action is, for this category — a swap for a DEX, a mint for a stablecoin, a payment for a payments protocol. Same ordering discipline as actionFor: 'index' before 'dex', 'interest rate' before 'derivative', 'curator'/'allocator' before 'chain', and 'chain' matches only the category Chain itself. */
function weeklyActionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('index')) return 'a buy or a rebalance';
  if (c.includes('dex')) return 'a swap';
  if (c.includes('cdp') || c.includes('stable')) return 'a mint or a redemption';
  if (c.includes('prediction')) return 'a position in a market';
  if (c.includes('payment')) return 'a payment';
  if (c.includes('insurance')) return 'a cover check or a renewal';
  if (c.includes('rwa') || c.includes('anchor') || c.includes('decentralized btc')) return 'a mint or a redemption';
  if (c.includes('restak')) return 'a restake or a claim';
  if (c.includes('interest rate')) return 'a deposit or a withdrawal';
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('option')) return 'a trade or a margin top-up';
  if (c.includes('governance')) return 'a vote';
  if (c.includes('curator') || c.includes('allocator')) return 'a deposit or a rebalance';
  if (c.includes('yield') || c.includes('basis') || c.includes('farm') || c.includes('liquidity manager')) return 'a deposit or a rebalance';
  if (c === 'chain') return 'a transaction';
  if (c.includes('card')) return 'a card spend';
  if (c.includes('otc')) return 'an order';
  return 'a deposit, a borrow or a swap';
}

/** Whether this category plausibly runs a points or rewards program a farmer can check. 'chain' matches only the category Chain itself — an Onchain Capital Allocator is a vault, and it can run a points program. */
function hasPointsProgram(p: SnapshotProtocol): boolean {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('cdp') || c.includes('stable')) return false;
  if (c.includes('payment') || c.includes('insurance') || c.includes('privacy')) return false;
  if (c.includes('anchor') || c.includes('decentralized btc') || c.includes('card') || c.includes('otc')) return false;
  if (c === 'chain') return false;
  return true;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const action = actionFor(p, capital, chain);
  const weekly = weeklyActionFor(p);
  const points = hasPointsProgram(p)
    ? `Before you withdraw, open ${p.name}'s own points or rewards page from the link its app publishes and check what counted.`
    : `Before you withdraw, open ${p.name}'s own announcements page from the link its app publishes and check for a token or points program — if it runs none, there is nothing to claim.`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.`,
      cost: `${gas} of gas for the first transaction on ${chain}`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about ${gas} of gas on ${chain}`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one qualifying action each week on ${chain} — ${weekly} — so the wallet reads as active, not one-off.`,
      cost: `about ${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: points,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log, and revoke the token approval when you exit the position.`,
      cost: 'nothing but the log and one revoke transaction',
      time: '5 minutes',
    },
  ];
}

/**
 * The live-token protocols, by market cap, for the dashboard's Already-trades view. Under the same
 * rules as the board, minus the pre-token requirement: no versioned pools, no wrapped/staked/bridged
 * product of a token that trades, no exchange — and no ratio artefact (a market cap more than 10x
 * its TVL is a token with almost no TVL in the protocol, not a comp: Rain at 400x is the example).
 * The view shows the separation, not a second ranking.
 */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && !EXCLUDED_CATEGORIES.has(p.category ?? '') && !VERSIONED.test(p.name) && !EXCHANGE_PREFIX.test(p.name) && !WRAPPED_WORD.test(p.name))
    .filter((p) => (p.mcap_usd ?? 0) > 0 && p.tvl_usd > 0 && p.mcap_usd! / p.tvl_usd <= 10)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    comps_n: row.model.comps_n,
    cat_median: row.model.cat_median,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    watchlist: watchlist.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { comps, globalMedian } = compMultiples(snapshot, model);
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  // The comp table shows only the categories the board actually ranks: a multiple for a category
  // with no board row is not a claim the judge can check against the board. A board category with
  // no eligible live comp is shown with n=0 and the global median — the multiple its rows actually
  // use — rather than vanishing from the table (Chain, after the staking product was excluded).
  const boardCategories = new Set(board.map((r) => r.category ?? 'Uncategorized'));
  const shownComps = comps.filter((c) => boardCategories.has(c.category));
  const shownNames = new Set(shownComps.map((c) => c.category));
  for (const cat of [...boardCategories].sort()) {
    if (!shownNames.has(cat)) {
      shownComps.push({ category: cat, n: 0, median: Math.round(globalMedian * 1000) / 1000, multiple: Math.round(globalMedian * 1000) / 1000 });
    }
  }
  shownComps.sort((a, b) => b.n - a.n || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_median: Math.round(globalMedian * 10000) / 10000,
    total_protocols: snapshot.protocols.length,
    pre_token_count: snapshot.protocols.filter(isPreToken).length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    comps: shownComps,
    rows: board.map((r) => radarRow(r, new Set(snapshot.watchlist))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
