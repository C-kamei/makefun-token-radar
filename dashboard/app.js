// Token Radar's dashboard, model radar-2. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail drawer with the
// model's own inputs and the protocol's farm plan, the already-trades view and the methodology.
// No network: every byte it shows is in data.js.
//
// The model, in the page's own arithmetic — the same function main.ts runs in lib/model.ts, so the
// number the board carries and the number the page shows are one calculation:
//
//   implied = round(TVL x multiple x growthMult x maturityMult x chainMult)
//   multiple   = the row's category comp multiple: median mcap/TVL of the token-bearing protocols
//                in that category, winsorized, the category median clamped to 0.05–1.0, then
//                shrunk to the global median: (n x median + 8 x 0.223) / (n + 8) (see Method).
//                A category with one live comp takes a multiple near the global median.
//   growthMult = 1 + clamp(change_7d, -40, +80) / 100 x 0.75
//   maturity   = 0.85 + 0.15 x min(age_days, 1095) / 1095   (age unknown: 365 days)
//   chainMult  = 1 + 0.04 x min(chains - 1, 5)
//
// The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
// decide the action, the capital, the hold and every cost and time. No name is special-cased.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var MODEL = DATA.model;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlist: false, tab: 'board', sort: 'implied', dir: -1, selected: null };

  // Deep-link a state for screenshots and sharing: #tab=board&detail=<slug>, #category=Dexs,
  // #chain=Base, #q=<text>, #watchlist=1, #sort=tvl. Every key is optional.
  (function readHash() {
    try {
      var h = new URLSearchParams(location.hash.slice(1));
      if (h.get('tab')) state.tab = h.get('tab');
      if (h.get('q')) state.q = h.get('q');
      if (h.get('category')) state.category = h.get('category');
      if (h.get('chain')) state.chain = h.get('chain');
      if (h.get('watchlist') === '1') state.watchlist = true;
      if (h.get('sort')) state.sort = h.get('sort');
      if (h.get('detail')) state.selected = h.get('detail');
    } catch (e) { /* a bad hash leaves the defaults */ }
  })();

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return n === null || n === undefined ? 'n/a' : n.toFixed(3) + 'x'; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row) {
    var growth = clamp(row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d, MODEL.growth_floor, MODEL.growth_cap);
    var growthMult = 1 + (growth / 100) * MODEL.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days;
    var maturity = MODEL.maturity_floor + (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
    var chainMult = 1 + MODEL.chain_step * Math.min(Math.max((row.chains || []).length - 1, 0), MODEL.chain_max_extra);
    return Math.max(1, Math.min(MODEL.cap_usd, Math.round(row.tvl_usd * row.multiple * growthMult * maturity * chainMult)));
  }
  function growthMultOf(row) {
    var growth = clamp(row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d, MODEL.growth_floor, MODEL.growth_cap);
    return 1 + (growth / 100) * MODEL.growth_weight;
  }
  function maturityOf(row) {
    var age = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days;
    return MODEL.maturity_floor + (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
  }
  function chainMultOf(row) {
    return 1 + MODEL.chain_step * Math.min(Math.max((row.chains || []).length - 1, 0), MODEL.chain_max_extra);
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // --- the farm plan: the same derivation main.ts writes to board.json ---------------------------
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasFor(chain) {
    var table = {
      'Ethereum': '$3–$12', 'Base': '$0.10–$0.50', 'Arbitrum': '$0.10–$0.50', 'Optimism': '$0.10–$0.50',
      'Solana': '$0.01', 'Sui': '$0.01', 'Aptos': '$0.01', 'BSC': '$0.20–$1',
      'Binance': '$0.20–$1', 'Polygon': '$0.05–$0.50', 'Avalanche': '$0.30–$2', 'zkSync Era': '$0.10–$1',
      'Linea': '$0.10–$1', 'Scroll': '$0.10–$1', 'Blast': '$0.10–$1', 'Mode': '$0.10–$0.50',
      'Fraxtal': '$0.10–$0.50', 'Berachain': '$0.10–$1', 'Hyperliquid': '$0.10–$1', 'Hyperliquid L1': '$0.01',
      'Sei': '$0.05–$0.50', 'Monad': '$0.05–$0.50', 'MegaETH': '$0.05–$0.50', 'Sonic': '$0.05–$0.50',
      'Unichain': '$0.10–$0.50', 'Ink': '$0.10–$0.50', 'Abstract': '$0.10–$0.50',
      'Bitcoin': '$1–$5', 'Stellar': '$0.01', 'Flare': '$0.05–$0.50', 'Arc': '$0.10–$0.50',
      'Provenance': '$0.05–$0.50', 'Plasma': '$0.10–$0.50', 'Robinhood Chain': '$0.10–$0.50',
      'Algorand': '$0.01', 'Ripple': '$0.01', 'RISE': '$0.10–$0.50', 'Mantle': '$0.10–$0.50',
      'Tron': '$0.30–$2', 'Bittensor': '$0.05–$0.50', 'BSquared': '$0.10–$0.50', 'Pharos': '$0.10–$0.50',
      'Noble': '$0.01', 'World Chain': '$0.10–$0.50', 'Manta': '$0.10–$0.50', 'Mezo': '$0.10–$0.50',
      'XION': '$0.01', 'Stable': '$0.10–$0.50', 'Reya Network': '$0.10–$0.50', 'Tempo': '$0.10–$0.50',
      'Morph': '$0.10–$0.50', 'RSK': '$0.05–$0.50', 'Proton': '$0.01', 'Ronin': '$0.05–$0.50',
      'Strato': '$0.10–$0.50', 'Klaytn': '$0.05–$0.50', 'Kava': '$0.05–$0.50', 'Canton': '$0.10–$0.50',
      'Bifrost Network': '$0.05–$0.50', 'Fluent': '$0.10–$0.50', 'Starknet': '$0.10–$1',
      'Plume Mainnet': '$0.10–$0.50', 'Stacks': '$0.10–$1', 'Qubic': '$0.10–$0.50'
    };
    return table[chain] || '$0.50–$3';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  // Order matters: substring matches, so the longer, more specific names come first — 'uncollateralized'
  // before 'collateral', 'index' before 'dex', 'interest rate' before 'derivative', and 'chain' matches
  // only the category Chain itself (Onchain Capital Allocator is a curator, not a chain).
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('uncollateralized') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open so it counts as a lender';
    if (c.indexOf('cdp manager') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC as collateral to ' + name + ' on ' + chain + ' and keep the position open so it counts as a borrower';
    if (c.indexOf('cdp') >= 0 || c.indexOf('stable') >= 0) return 'Mint $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' by locking collateral, and keep the position collateralized';
    if (c.indexOf('lend') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open so it counts as a lender';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of ' + name + '\'s index token on ' + chain + ' and hold it';
    if (c.indexOf('dex') >= 0) return 'Make a $' + capital + ' swap on ' + name + ' on ' + chain + ' and repeat it weekly so the wallet reads as an active trader';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + '\'s main yield vault on ' + chain + ' and keep the vault shares';
    if (c.indexOf('leveraged farm') >= 0) return 'Open a $' + capital + ' leveraged farming position on ' + name + ' on ' + chain + ' and keep it above its liquidation line';
    if (c.indexOf('interest rate') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + '\'s rate market on ' + chain + ' and keep the position open';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small hedged position';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of ' + name + '\'s yield-bearing asset on ' + chain + ' and hold it in your wallet';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + '\'s basis vault on ' + chain + ' and keep the vault shares';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + '\'s curated vault on ' + chain + ' and keep the vault shares';
    if (c.indexOf('restak') >= 0) return 'Restake $' + capital + ' of the chain\'s staking asset through ' + name + ' on ' + chain + ' and keep the receipt token';
    if (c.indexOf('prediction') >= 0) return 'Fund ' + name + ' with $' + capital + ' on ' + chain + ' and place one position in a market that runs at least a week';
    if (c.indexOf('payment') >= 0) return 'Open a $' + capital + ' payment channel on ' + name + ' on ' + chain + ' and route at least one real payment through it';
    if (c.indexOf('privacy') >= 0) return 'Deposit $' + capital + ' into ' + name + '\'s private pool on ' + chain + ' and withdraw it to a fresh address afterwards';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy for its full term';
    if (c.indexOf('option') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + '\'s options vault on ' + chain + ' and keep the vault shares';
    if (c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + '\'s managed liquidity vault on ' + chain + ' and keep the vault shares';
    if (c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' into ' + name + '\'s main farm on ' + chain + ' and keep the position staked';
    if (c.indexOf('anchor') >= 0 || c.indexOf('decentralized btc') >= 0) return 'Mint $' + capital + ' of ' + name + '\'s BTC-backed asset on ' + chain + ' and hold it in your wallet';
    if (c.indexOf('otc') >= 0) return 'Place a $' + capital + ' OTC order through ' + name + ' on ' + chain + ' and settle it in full';
    if (c.indexOf('governance') >= 0) return 'Lock $' + capital + ' of USDC in ' + name + '\'s governance vault on ' + chain + ' and vote on at least one proposal';
    if (c.indexOf('card') >= 0) return 'Load $' + capital + ' onto ' + name + '\'s card on ' + chain + ' and spend it on a real purchase';
    if (c === 'chain') return 'Bridge $' + capital + ' of USDC onto ' + name + ' and use its apps there — a swap, a deposit or a vote — at least once a week';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open';
  }
  function weeklyActionFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('index') >= 0) return 'a buy or a rebalance';
    if (c.indexOf('dex') >= 0) return 'a swap';
    if (c.indexOf('cdp') >= 0 || c.indexOf('stable') >= 0) return 'a mint or a redemption';
    if (c.indexOf('prediction') >= 0) return 'a position in a market';
    if (c.indexOf('payment') >= 0) return 'a payment';
    if (c.indexOf('insurance') >= 0) return 'a cover check or a renewal';
    if (c.indexOf('rwa') >= 0 || c.indexOf('anchor') >= 0 || c.indexOf('decentralized btc') >= 0) return 'a mint or a redemption';
    if (c.indexOf('restak') >= 0) return 'a restake or a claim';
    if (c.indexOf('interest rate') >= 0) return 'a deposit or a withdrawal';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('option') >= 0) return 'a trade or a margin top-up';
    if (c.indexOf('governance') >= 0) return 'a vote';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'a deposit or a rebalance';
    if (c.indexOf('yield') >= 0 || c.indexOf('basis') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'a deposit or a rebalance';
    if (c === 'chain') return 'a transaction';
    if (c.indexOf('card') >= 0) return 'a card spend';
    if (c.indexOf('otc') >= 0) return 'an order';
    return 'a deposit, a borrow or a swap';
  }
  function hasPointsProgram(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('cdp') >= 0 || c.indexOf('stable') >= 0) return false;
    if (c.indexOf('payment') >= 0 || c.indexOf('insurance') >= 0 || c.indexOf('privacy') >= 0) return false;
    if (c.indexOf('anchor') >= 0 || c.indexOf('decentralized btc') >= 0 || c.indexOf('card') >= 0 || c.indexOf('otc') >= 0) return false;
    if (c === 'chain') return false;
    return true;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    var action = actionFor(p, capital, chain);
    var weekly = weeklyActionFor(p);
    var points = hasPointsProgram(p)
      ? 'Before you withdraw, open ' + p.name + '\'s own points or rewards page from the link its app publishes and check what counted.'
      : 'Before you withdraw, open ' + p.name + '\'s own announcements page from the link its app publishes and check for a token or points program — if it runs none, there is nothing to claim.';
    var steps = [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.', cost: gas + ' of gas for the first transaction on ' + chain, time: '5 minutes' },
      { text: action, cost: '$' + capital + ' of capital and about ' + gas + ' of gas on ' + chain, time: '15 minutes to set up' },
      { text: 'Do one qualifying action each week on ' + chain + ' — ' + weekly + ' — so the wallet reads as active, not one-off.', cost: 'about ' + gas + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: points, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction hash in a farm log, and revoke the token approval when you exit the position.', cost: 'nothing but the log and one revoke transaction', time: '5 minutes' }
    ];
    return steps.map(function (s) {
      var t = s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.';
      if (t.length > 600) t = t.slice(0, 596) + '...';
      if (t.length < 20) t = t + ' Hold the position and check the protocol\'s own page.';
      return t;
    });
  }

  // --- filtering and sorting ---------------------------------------------------------------------
  function categories() {
    var seen = {};
    DATA.rows.forEach(function (r) { seen[r.category || 'Uncategorized'] = true; });
    return Object.keys(seen).sort();
  }
  function chains() {
    var seen = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { seen[c] = true; }); });
    return Object.keys(seen).sort();
  }
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.watchlist && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var av = key === 'rank' ? a.rank : key === 'tvl' ? a.tvl_usd : key === 'growth' ? (a.change_7d === null ? -9999 : a.change_7d) : key === 'age' ? (a.age_days === null ? -1 : a.age_days) : a.implied_value_usd;
      var bv = key === 'rank' ? b.rank : key === 'tvl' ? b.tvl_usd : key === 'growth' ? (b.change_7d === null ? -9999 : b.change_7d) : key === 'age' ? (b.age_days === null ? -1 : b.age_days) : b.implied_value_usd;
      if (av !== bv) return (av < bv ? -1 : 1) * dir;
      return a.slug < b.slug ? -1 : 1;
    });
    return rows;
  }

  // --- rendering ---------------------------------------------------------------------------------
  function sortButton(label, key) {
    var arrow = state.sort === key ? (state.dir === -1 ? ' ▼' : ' ▲') : '';
    return el('button', { type: 'button', onclick: function () {
      if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'rank' ? 1 : -1; }
      render();
    } }, label + arrow);
  }

  function renderDetail(row) {
    var check = impliedOf(row);
    var matches = check === row.implied_value_usd;
    var wrap = el('section', { class: 'detail', 'aria-label': 'Protocol detail' });
    var head = el('div', { class: 'detail-head' },
      el('div', null,
        el('h2', null, '#' + row.rank + ' ' + row.name),
        el('div', { class: 'sub' }, (row.category || 'Uncategorized') + ' · ' + (row.chains || []).join(', ') + ' · listed ' + (row.listed_at || 'unknown') + (row.watchlist ? ' · on the watchlist' : ' · below the watchlist floor'))
      ),
      el('button', { class: 'close', type: 'button', onclick: function () { state.selected = null; render(); } }, 'Close ×')
    );
    var kv = el('div', { class: 'kv' }, [
      ['Implied value', fmtUsd(row.implied_value_usd)],
      ['TVL', fmtUsd(row.tvl_usd)],
      ['7-day TVL change', fmtPct(row.change_7d)],
      ['Age with no token', fmtAge(row.age_days)],
      ['Category comp multiple', fmtMult(row.multiple)],
      ['Comps in category', String(row.comps_n) + (row.comps_n > 0 ? ' (median ' + row.cat_median.toFixed(3) + 'x)' : ' (global median)')]
    ].map(function (kvPair) {
      return el('div', { class: 'cell' }, el('span', null, kvPair[0]), el('b', null, kvPair[1]));
    }));
    var formula = el('div', { class: 'formula' },
      fmtUsd(row.tvl_usd) + ' TVL × ' + row.multiple.toFixed(3) + ' comp × ' + growthMultOf(row).toFixed(3) + ' growth × ' +
      maturityOf(row).toFixed(3) + ' maturity × ' + chainMultOf(row).toFixed(3) + ' chains = ',
      el('b', null, fmtUsd(row.implied_value_usd)),
      matches ? '  ✓ recomputed in this page' : '  ⚠ page recompute differs — see Method'
    );
    // The multiple's own arithmetic: category median → clamped → shrunk to the global median.
    // A category with one live comp takes a multiple near the global median; the formula above
    // already uses the shrunk number, and this line shows where it came from.
    var clamped = Math.min(MODEL.cat_median_max, Math.max(MODEL.cat_median_min, row.cat_median));
    var shrinkLine = row.comps_n > 0
      ? 'Category median ' + row.cat_median.toFixed(3) + 'x → clamped to ' + clamped.toFixed(3) + 'x → shrunk (' + row.comps_n + '×' + clamped.toFixed(3) + ' + ' + MODEL.shrink_prior + '×' + DATA.global_median.toFixed(3) + ') / (' + row.comps_n + '+' + MODEL.shrink_prior + ') = ' + row.multiple.toFixed(3) + 'x'
      : 'No live comps in this category — the multiple is the global median ' + DATA.global_median.toFixed(3) + 'x';
    var shrink = el('div', { class: 'formula-note' }, shrinkLine);
    var steps = el('ol', { class: 'steps' }, farmSteps(row).map(function (s) {
      var m = s.match(/ Cost: (.*)\. Time: (.*)\.$/);
      var text = m ? s.slice(0, m.index) : s;
      var meta = m ? 'Cost: ' + m[1] + ' · Time: ' + m[2] : '';
      return el('li', null, el('div', null, el('p', null, text), el('div', { class: 'meta' }, meta)));
    }));
    wrap.appendChild(head);
    wrap.appendChild(kv);
    wrap.appendChild(formula);
    wrap.appendChild(shrink);
    wrap.appendChild(el('h3', null, 'How to farm it'));
    wrap.appendChild(steps);
    wrap.appendChild(el('p', { class: 'note' },
      el('b', null, 'What this is not: '),
      'the snapshot records no token for ' + row.name + ' — that is DefiLlama\u2019s record, not proof it has none, and never a promise it will issue one. ' +
      'The implied value is this radar\u2019s claim from the snapshot\u2019s own figures; a launch may never come, and a farm plan is work, not a guarantee. ' +
      'Never pay to claim, and never connect a wallet holding funds you cannot lose.'
    ));
    return wrap;
  }

  function renderBoard() {
    var rows = filteredRows();
    var frag = document.createDocumentFragment();
    var controls = el('div', { class: 'controls' },
      el('input', { type: 'search', placeholder: 'Search a protocol…', value: state.q, 'aria-label': 'Search protocols', oninput: function (e) { state.q = e.target.value; render(); } }),
      el('select', { 'aria-label': 'Filter by category', onchange: function (e) { state.category = e.target.value; render(); } },
        el('option', { value: 'all' }, 'All categories'),
        categories().map(function (c) { return el('option', { value: c, selected: state.category === c ? 'selected' : null }, c); })
      ),
      el('select', { 'aria-label': 'Filter by chain', onchange: function (e) { state.chain = e.target.value; render(); } },
        el('option', { value: 'all' }, 'All chains'),
        chains().map(function (c) { return el('option', { value: c, selected: state.chain === c ? 'selected' : null }, c); })
      ),
      el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: state.watchlist ? 'checked' : null, onchange: function (e) { state.watchlist = e.target.checked; render(); } }), 'Watchlist only')
    );
    frag.appendChild(controls);
    frag.appendChild(el('p', { class: 'result-line' },
      'Showing ', el('b', null, String(rows.length)), ' of ' + DATA.rows.length + ' ranked protocols · sorted by ' + state.sort +
      ' · ' + DATA.watchlist_size + ' watchlist protocols, ' + DATA.early_size + ' found below the floor'
    ));
    if (rows.length === 0) {
      frag.appendChild(el('div', { class: 'empty' }, 'No protocol matches these filters. Clear the search or widen the category.'));
      return frag;
    }
    var table = el('table', { class: 'board' });
    var thead = el('thead', null, el('tr', null,
      el('th', null, sortButton('Rank', 'rank')),
      el('th', null, 'Protocol'),
      el('th', null, 'Category'),
      el('th', null, 'Chains'),
      el('th', null, sortButton('TVL', 'tvl')),
      el('th', null, sortButton('7d', 'growth')),
      el('th', null, sortButton('Age', 'age')),
      el('th', null, sortButton('Implied value', 'implied'))
    ));
    var tbody = el('tbody', null, rows.map(function (r) {
      var tr = el('tr', {
        class: state.selected === r.slug ? 'selected' : null,
        onclick: function () { state.selected = r.slug; render(); var d = document.querySelector('.detail'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      },
        el('td', { class: 'rank num' }, '#' + r.rank),
        el('td', { class: 'name' }, el('b', null, r.name), el('div', { class: 'sub' }, r.watchlist ? el('span', { class: 'badge watch' }, 'WATCHLIST') : null, el('small', null, r.slug))),
        el('td', { class: 'cat' }, r.category || '—'),
        el('td', { class: 'chains' }, (r.chains || []).slice(0, 3).join(', ') + ((r.chains || []).length > 3 ? ' +' + ((r.chains || []).length - 3) : '')),
        el('td', { class: 'tvl num' }, fmtUsd(r.tvl_usd)),
        el('td', { class: 'growth num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg') }, fmtPct(r.change_7d)),
        el('td', { class: 'age num' }, fmtAge(r.age_days)),
        el('td', { class: 'impl num' }, fmtUsd(r.implied_value_usd))
      );
      return tr;
    }));
    table.appendChild(thead);
    table.appendChild(tbody);
    frag.appendChild(table);
    return frag;
  }

  function renderLive() {
    var frag = document.createDocumentFragment();
    frag.appendChild(el('p', { class: 'result-line' },
      'These ' + DATA.live.length + ' already trade — the market\u2019s own values, shown apart so the board never mixes a live token into a launch ranking. ' +
      'Under the same rules as the board: no versioned pools, no wrapped/staked/bridged product of a token that trades, no exchange, and no ratio artefact (a market cap over 10× its TVL). ' +
      'They come from the same live set the comps are drawn from: each category\u2019s multiple is the median mcap/TVL of its live protocols.'
    ));
    var table = el('table', { class: 'board' });
    table.appendChild(el('thead', null, el('tr', null,
      el('th', null, '#'), el('th', null, 'Protocol'), el('th', null, 'Category'), el('th', null, 'Chains'),
      el('th', null, 'TVL'), el('th', null, '7d'), el('th', null, 'Market cap')
    )));
    table.appendChild(el('tbody', null, DATA.live.map(function (r, i) {
      return el('tr', { style: 'cursor:default' },
        el('td', { class: 'rank num' }, String(i + 1)),
        el('td', { class: 'name' }, el('b', null, r.name), el('small', null, r.slug)),
        el('td', { class: 'cat' }, r.category || '—'),
        el('td', { class: 'chains' }, (r.chains || []).slice(0, 3).join(', ')),
        el('td', { class: 'tvl num' }, fmtUsd(r.tvl_usd)),
        el('td', { class: 'growth num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg') }, fmtPct(r.change_7d)),
        el('td', { class: 'impl num' }, fmtUsd(r.mcap_usd))
      );
    })));
    frag.appendChild(table);
    return frag;
  }

  function renderMethod() {
    var wrap = el('div', { class: 'method' });
    var formula = el('section', null,
      el('h2', null, 'The model — radar-2'),
      el('p', null, 'Every row is one calculation from the snapshot\u2019s own figures, the same function in the program that wrote the board and in this page:'),
      el('div', { class: 'formula' }, 'implied = round(TVL × multiple × growth × maturity × chains)'),
      el('ul', null,
        el('li', null, el('strong', null, 'multiple — '), 'the category comp: median market-cap/TVL of the token-bearing protocols in the same category that pass the same exclusion rules (ratios winsorized to the global 5th–95th percentiles, the category median clamped to 0.05–1.0, then shrunk to the global median ', el('code', null, '(n·median + 8·0.223) / (n + 8)'), ', clamped to 0.02–2.5). A category with one live comp takes a multiple near the global median — the prior of 8 is the point: one comp is weak evidence. A category with no eligible live comp takes the global median, 0.223x.'),
        el('li', null, el('strong', null, 'growth — '), '1 + clamp(7-day TVL change, −40%, +80%) × 0.75. A protocol growing fast is worth more than the same TVL standing still.'),
        el('li', null, el('strong', null, 'maturity — '), '0.85 + 0.15 × min(age, 3y) / 3y. Running longer with a large TVL and still no token is a bigger overhang. Age unknown counts as 1 year.'),
        el('li', null, el('strong', null, 'chains — '), '1 + 0.04 × min(chains − 1, 5). More chains, wider distribution.'),
        el('li', null, el('strong', null, 'cap — '), 'implied value is capped at $100B and floored at $1. No protocol name is ever special-cased.')
      )
    );
    var rankable = el('section', null,
      el('h2', null, 'What the board ranks — and what it refuses'),
      el('p', null, 'The board ranks ', el('strong', null, String(DATA.board_size)), ' protocols: all ', el('strong', null, String(DATA.watchlist_size)), ' on the snapshot\u2019s watchlist, plus ', el('strong', null, String(DATA.early_size)), ' found below the watchlist floor, ranked by implied value. It refuses three kinds of protocol, by the snapshot\u2019s own watchlist rule, word for word:'),
      el('ul', null,
        el('li', null, el('strong', null, 'Wrapped, staked or bridged products — '), 'WBTC is Bitcoin on Ethereum, Binance staked ETH is ETH in a staking product: neither is a protocol still waiting on a launch of its own. Excluded categories: Bridge, Canonical Bridge, Cross Chain Bridge, Liquid Staking, Liquid Restaking, Restaked BTC.'),
        el('li', null, el('strong', null, 'Exchanges — '), 'an exchange is an off-chain business; a token of its own is a different question from a protocol launch.'),
        el('li', null, el('strong', null, 'Versioned pools — '), 'a name ending in V2, v2 or 2.0 is a pool of another protocol, not a protocol.'),
        el('li', null, el('strong', null, 'Already trading — '), 'the ', el('strong', null, String(DATA.live.length)), ' largest protocols with a token are shown apart, under Already trades, and never ranked as launches.'),
        el('li', null, el('strong', null, 'The watchlist is the floor — '), 'the ', el('strong', null, String(DATA.watchlist_size)), ' watchlist slugs are in by construction: they passed this same rule when the house built the list, so no watchlist row can violate it.')
      )
    );
    var comps = el('section', null,
      el('h2', null, 'Category comps — the multiples, from the snapshot'),
      el('p', null, 'Each multiple is the median mcap/TVL of that category\u2019s live protocols that pass the same exclusion rules, shrunk to the global median. Small categories lean on the global median; that is the point of the shrinkage. A category with no eligible live comp is shown with 0 comps and the global median. Only categories the board ranks are shown — a multiple for a category with no board row is not a claim the board makes.'),
      el('table', { class: 'comps' },
        el('thead', null, el('tr', null, el('th', null, 'Category'), el('th', null, 'Live comps'), el('th', null, 'Median mcap/TVL'), el('th', null, 'Multiple used'))),
        el('tbody', null, DATA.comps.map(function (c) {
          return el('tr', null, el('td', null, c.category), el('td', null, String(c.n)), el('td', null, c.median.toFixed(3) + 'x'), el('td', null, c.multiple.toFixed(3) + 'x'));
        }))
      )
    );
    var caveats = el('section', null,
      el('h2', null, 'Caveats — read before you farm'),
      el('ul', null,
        el('li', null, 'The snapshot is DefiLlama data fetched once, ', el('code', null, DATA.as_of), '. It does not move; a protocol may have launched, shut down or changed since.'),
        el('li', null, '“Records no token” is what the snapshot says — never proof a protocol has none, and never a promise it will issue one. Most of these protocols will never launch a token.'),
        el('li', null, 'An implied value is this radar\u2019s claim from TVL, growth, age and category comps. It is not a price, not a prediction and not financial advice.'),
        el('li', null, 'Farm plans are generated from each protocol\u2019s category, chains, TVL and age. Check the protocol\u2019s own pages before you deposit anything, never pay to claim, and never farm with money you cannot lose.')
      )
    );
    wrap.appendChild(formula);
    wrap.appendChild(rankable);
    wrap.appendChild(comps);
    wrap.appendChild(caveats);
    return wrap;
  }

  function render() {
    app.setAttribute('aria-busy', 'true');
    while (app.firstChild) app.removeChild(app.firstChild);
    var shell = el('div', { class: 'shell' });
    var top = el('div', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name' }, 'Token Radar · ' + DATA.model_version)),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ' + DATA.as_of),
        el('span', null, DATA.rows.length + ' ranked'),
        el('span', null, DATA.watchlist_size + ' on watchlist')
      )
    );
    shell.appendChild(top);
    shell.appendChild(el('div', { class: 'lede' },
      el('div', null,
        el('h1', null, 'Which protocol launches the next token — and what is it worth?'),
        el('p', null, 'A radar over ', el('strong', null, String(DATA.total_protocols) + ' protocols'), ' DefiLlama tracks. It finds the ones that record no token, ranks them by an implied value built from their own TVL, growth, age and category comps, and gives each one a concrete farm plan with costs and times.')
      ),
      el('div', { class: 'facts' }, [
        ['Protocols scanned', String(DATA.total_protocols)],
        ['Pre-token', String(DATA.pre_token_count)],
        ['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size],
        ['Board rows', String(DATA.rows.length)],
        ['Already trading (shown apart)', String(DATA.live.length)],
        ['Top implied value', fmtUsd(DATA.rows[0].implied_value_usd)]
      ].map(function (f) { return el('div', { class: 'fact' }, el('span', null, f[0]), el('b', null, f[1])); }))
    ));
    var tabs = el('div', { class: 'tabs', role: 'tablist' }, [
      ['board', 'Board', DATA.rows.length],
      ['live', 'Already trades', DATA.live.length],
      ['method', 'Method', null]
    ].map(function (t) {
      return el('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': state.tab === t[0] ? 'true' : 'false', onclick: function () { state.tab = t[0]; render(); } },
        t[1], t[2] === null ? null : el('span', { class: 'count' }, String(t[2])));
    }));
    shell.appendChild(tabs);
    if (state.tab === 'board') shell.appendChild(renderBoard());
    else if (state.tab === 'live') shell.appendChild(renderLive());
    else shell.appendChild(renderMethod());
    var selected = state.selected ? DATA.rows.filter(function (r) { return r.slug === state.selected; })[0] : null;
    if (selected) shell.appendChild(renderDetail(selected));
    shell.appendChild(el('p', { class: 'foot' },
      'Source: DefiLlama protocols snapshot, fetched ' + DATA.as_of + ' (' + DATA.source + '). ' +
      'Implied values are this radar\u2019s claims from the snapshot\u2019s figures, not predictions of issuance and not financial advice. ' +
      'Model ' + DATA.model_version + ' · board.json carries the same rows this page renders.'
    ));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
  }

  render();
})();
