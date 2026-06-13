// ─────────────────────────────────────────────────────────────────────────────
// Behavioral Trading Analysis
//
// Decodes *why* trades are made, *how* exits happen, and *where the blind spots
// live* — from the trade data itself. The structural layer works with zero
// annotations (it reads prices, quantities, dates, and the options lifecycle);
// the annotation layer enriches it as free-text reasons get added.
//
// Scalability: the behavioral *taxonomy* is data, not code. Each trait is a
// self-contained object that carries its own keywords AND its own copy
// (archetype, pattern description, buy trigger, exit note). Adding a trait —
// from the DB or an API call — automatically makes it participate in scoring,
// archetypes, buy triggers, patterns, and exit style, with no code change.
// Emerging-theme detection closes the loop: it surfaces recurring words in your
// reasons that no trait captures yet, so the taxonomy can grow with your habits.
// ─────────────────────────────────────────────────────────────────────────────

import type { Investment } from "../database/schema.js";

// ── Taxonomy types ───────────────────────────────────────────────────────────

export interface BehaviorTrait {
  id: string;
  label: string;
  /** Lowercase substrings matched against a trade's reason + goal text. */
  keywords: string[];
  /** Which side of a trade this trait usually explains. */
  side: 'buy' | 'sell' | 'any';
  /** Used to bucket traits when building blind spots / balance checks. */
  kind: 'thesis' | 'timing' | 'risk' | 'income' | 'structure' | 'emotion';
  /** Shown as a "Behavioral Pattern" card when this trait dominates. */
  pattern: string;
  /** Shown in the "Buy Triggers" list (omit for sell-only traits). */
  buyTrigger?: string;
  /** Shown in "Exit Style" when this trait dominates sell annotations. */
  exitNote?: string;
  /** [name, tagline] — candidate archetype when this trait dominates overall. */
  archetype?: [string, string];
}

// The seed taxonomy. Stored in the DB on first run; editable from there on.
export const DEFAULT_TRAITS: BehaviorTrait[] = [
  {
    id: 'dip_buying', label: 'Dip Buying', side: 'buy', kind: 'timing',
    keywords: ['dip', 'drop', 'dropped', 'fell', 'down', 'cheap', 'lower', 'pullback', 'discount', 'undervalued', 'correction', 'sold off', 'sell-off', 'oversold'],
    pattern: 'You step in when prices are down, treating market fear as an entry signal. That takes patience and a contrarian streak — just keep a recovery thesis attached so you are buying value, not catching a falling knife.',
    buyTrigger: 'Price is down — you see an entry, not a warning',
    archetype: ['The Dip Buyer', 'Buys fear, holds conviction — waiting for the market to prove itself wrong.'],
  },
  {
    id: 'long_term', label: 'Long-Term Conviction', side: 'any', kind: 'thesis',
    keywords: ['long term', 'long-term', 'hold', 'thesis', 'fundamental', 'growth', 'future', 'believe', 'conviction', 'years', 'patient', 'core position', 'hold forever', 'compounding'],
    pattern: 'Your reasoning is thesis-first: you buy the story, not the ticker, and your goals are measured in years. This is the backbone of most durable investor profiles.',
    buyTrigger: 'Conviction in the thesis, regardless of short-term price',
    exitNote: 'You rarely sell, and when you do it is because the thesis changed — not the price.',
    archetype: ['The Conviction Holder', 'Slow, deliberate, thesis-driven — built for the long game, not the next quarter.'],
  },
  {
    id: 'diversification', label: 'Diversification', side: 'any', kind: 'structure',
    keywords: ['diversif', 'index', 'etf', 'broad', 'exposure', 'rebalanc', 'hedge', 'balanced', 'spread', 'allocation', 'fund'],
    pattern: 'You deliberately spread exposure across sectors and asset classes — a sign you respect concentration risk and prefer steady compounding over single-name bets.',
    buyTrigger: 'The portfolio needs exposure to this sector or asset class',
    exitNote: 'You rebalance rather than abandon — sells tend to be rotations, not full exits.',
    archetype: ['The Index Architect', 'Methodical and measured — spreads risk across the board before concentrating anywhere.'],
  },
  {
    id: 'averaging', label: 'Cost Averaging', side: 'buy', kind: 'structure',
    keywords: ['average', 'avg', 'dca', 'dollar cost', 'adding more', 'add more', 'accumulate', 'cost basis', 'keep buying', 'buying more', 'contribution', 'recurring'],
    pattern: 'You return to the same positions over time, lowering your cost basis and building conviction incrementally. Dollar-cost averaging is your default when you trust the direction but not the timing.',
    buyTrigger: 'Already holding — time to add and lower the cost basis',
    archetype: ['The Dollar-Cost Machine', 'Patient and systematic — keeps feeding positions through the noise.'],
  },
  {
    id: 'momentum', label: 'Momentum / FOMO', side: 'buy', kind: 'emotion',
    keywords: ['fomo', 'momentum', 'trending', 'hot', 'run', 'rally', 'surge', 'hype', 'breakout', 'moving', 'up big', 'on a run', 'going up', 'mooning'],
    pattern: 'Some entries are driven by price action and energy — you buy when things are already moving. That can capture real upside, but it blurs the line between a thesis and FOMO if no plan is attached.',
    buyTrigger: 'Price action is strong and confirming',
    archetype: ['The Momentum Chaser', 'Follows price and energy — gets in when things are moving, not before.'],
  },
  {
    id: 'income', label: 'Income / Yield', side: 'any', kind: 'income',
    keywords: ['dividend', 'income', 'yield', 'distribution', 'passive', 'payout', 'cash flow'],
    pattern: 'Dividends and yield are a recurring theme — you think in cash flow, not just price appreciation. That is long-horizon portfolio thinking.',
    buyTrigger: 'The dividend or yield justifies the position',
    archetype: ['The Yield Hunter', 'Buys for cash flow — distributions are the thesis, not a bonus.'],
  },
  {
    id: 'news_driven', label: 'Catalyst / News', side: 'any', kind: 'timing',
    keywords: ['earnings', 'news', 'catalyst', 'report', 'event', 'launch', 'announcement', 'beat', 'guidance', 'fda', 'approval', 'merger'],
    pattern: 'Earnings, launches, and catalysts pull you in. You watch for a trigger that justifies the move — disciplined when the source is solid, reactive when it is not.',
    buyTrigger: 'A clear catalyst (earnings, launch, approval) creates the trigger',
    exitNote: 'Catalysts trigger exits as much as entries — you sell once the event has played out.',
    archetype: ['The Catalyst Trader', 'Event-driven — enters on a clear trigger, not just a feeling.'],
  },
  {
    id: 'risk_management', label: 'Risk Management', side: 'sell', kind: 'risk',
    keywords: ['stop loss', 'limit', 'protect', 'defensive', 'safe', 'reduce risk', 'trim', 'too much exposure', 'rebalance', 'lock in', 'hedge', 'cut'],
    pattern: 'You think about exits before entries — trimming, hedging, and reducing exposure show up in your reasoning. That is portfolio-level thinking, not just stock-picking.',
    exitNote: 'You sell to manage exposure — exits are defensive and deliberate, not panic.',
    archetype: ['The Risk Manager', 'Thinks in exits before entries — every position has a defined limit.'],
  },
  {
    id: 'profit_taking', label: 'Profit Taking', side: 'sell', kind: 'risk',
    keywords: ['profit', 'gain', 'return', 'selling high', 'take some off', 'lock in', 'target reached', 'goal met', 'took profit', 'realized'],
    pattern: 'You actually sell when targets are hit — locking in gains is a discipline most investors underuse, and your trades suggest you have built the habit.',
    exitNote: 'You exit when targets are hit — clean, pre-planned decisions rather than emotional ones.',
    archetype: ['The Disciplined Trimmer', 'Sets targets and hits them — does not let winners run into regret.'],
  },
  {
    id: 'speculation', label: 'Speculation', side: 'buy', kind: 'emotion',
    keywords: ['gamble', 'lottery', 'yolo', 'punt', 'flyer', 'moonshot', 'play', 'bet', 'risky', 'speculative', 'options', 'calls', 'puts'],
    pattern: 'A slice of your activity is openly speculative — small high-risk bets for asymmetric upside. Fine as a satellite to a core, dangerous if it quietly grows into the core.',
    buyTrigger: 'A small, high-risk shot at asymmetric upside',
    archetype: ['The Satellite Speculator', 'Steady core, speculative edges — keeps the gambling fenced off from the foundation.'],
  },
];

// ── Output types ─────────────────────────────────────────────────────────────

export interface AnalysisPattern { name: string; description: string; evidence: string[]; }
export interface AnalysisMetric { label: string; value: string; sub: string; tone: 'good' | 'warn' | 'bad' | 'neutral'; }
export interface EmergingTheme { term: string; count: number; examples: string[]; }

export interface BehaviorAnalysis {
  archetype: string;
  tagline: string;
  patterns: AnalysisPattern[];
  buy_triggers: string[];
  exit_style: string;
  blind_spots: string[];
  metrics: AnalysisMetric[];
  emerging_themes: EmergingTheme[];
  annotated_count: number;
  trade_count: number;
  engine: 'local' | 'ai';
}

// ── Small helpers ────────────────────────────────────────────────────────────

const BUY_ACTIONS = new Set(['BUY', 'OPTIONS_BUY']);
const SELL_ACTIONS = new Set(['SELL', 'OPTIONS_SELL', 'EXPIRED']);

function isBuy(t: Investment) { return BUY_ACTIONS.has(t.action_type); }
function isSell(t: Investment) { return SELL_ACTIONS.has(t.action_type); }
function annotationText(t: Investment) { return [t.reason ?? '', t.future_goal ?? ''].join(' ').trim(); }

/** "MM/DD/YYYY" -> sortable YYYYMMDD number (0 if unparseable). */
function dateKey(run_date: string): number {
  const m = run_date.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return 0;
  return +`${m[3]}${m[1].padStart(2, '0')}${m[2].padStart(2, '0')}`;
}
function dateMs(run_date: string): number {
  const m = run_date.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return 0;
  return new Date(+m[3], +m[1] - 1, +m[2]).getTime();
}
function pct(n: number, d: number): number { return d > 0 ? Math.round((n / d) * 100) : 0; }
function money(n: number): string {
  const abs = Math.abs(n);
  const s = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toFixed(0)}`;
  return n < 0 ? `-${s}` : s;
}

// ── Structural signals (work with zero annotations) ──────────────────────────

interface StructuralSignals {
  total: number; buys: number; sells: number; optionsCount: number;
  buySellRatio: number;
  distinctSymbols: number;
  topTicker: { symbol: string; count: number } | null;
  concentrationPct: number;          // share of trades in the single most-traded symbol
  dcaTickers: { symbol: string; buys: number }[];  // symbols bought >= 3 times
  // Realized exit discipline (stock sells matched to prior buys by avg cost)
  exits: {
    matched: number; winners: number; losers: number;
    avgReturnPct: number | null; examples: { symbol: string; returnPct: number }[];
  };
  // Options scorecard
  options: {
    contracts: number; expiredWorthless: number; netPremium: number; winRate: number | null;
    worst: { symbol: string; net: number } | null;
  };
  // Cadence
  firstYear: number | null; lastYear: number | null; busiestYear: { year: number; count: number } | null;
}

function computeStructural(trades: Investment[]): StructuralSignals {
  const buys = trades.filter(isBuy);
  const sells = trades.filter(isSell);
  const optionTrades = trades.filter(t => t.is_option);

  // Concentration / DCA
  const counts: Record<string, number> = {};
  const buyCounts: Record<string, number> = {};
  for (const t of trades) counts[t.symbol] = (counts[t.symbol] ?? 0) + 1;
  for (const t of buys) buyCounts[t.symbol] = (buyCounts[t.symbol] ?? 0) + 1;
  const rankedTickers = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const topTicker = rankedTickers[0] ? { symbol: rankedTickers[0][0], count: rankedTickers[0][1] } : null;
  const dcaTickers = Object.entries(buyCounts)
    .filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1])
    .map(([symbol, b]) => ({ symbol, buys: b }));

  // Realized exit discipline — avg-cost basis per stock symbol, chronological.
  const stockTrades = trades.filter(t => !t.is_option).slice().sort((a, b) => dateKey(a.run_date) - dateKey(b.run_date));
  const lots: Record<string, { shares: number; cost: number }> = {};
  let matched = 0, winners = 0, losers = 0; let retSum = 0;
  const exitExamples: { symbol: string; returnPct: number }[] = [];
  for (const t of stockTrades) {
    const lot = lots[t.symbol] ?? (lots[t.symbol] = { shares: 0, cost: 0 });
    if (t.action_type === 'BUY' && t.quantity && t.price) {
      lot.shares += Math.abs(t.quantity);
      lot.cost += Math.abs(t.amount ?? t.quantity * t.price);
    } else if (t.action_type === 'SELL' && t.quantity && t.price) {
      const qtySold = Math.abs(t.quantity);
      if (lot.shares > 0.0001) {
        const avgCost = lot.cost / lot.shares;
        const costOfSold = avgCost * Math.min(qtySold, lot.shares);
        const proceeds = t.amount ?? qtySold * t.price;
        const ret = costOfSold > 0 ? (proceeds - costOfSold) / costOfSold : 0;
        matched++; retSum += ret;
        if (ret >= 0) winners++; else losers++;
        exitExamples.push({ symbol: t.symbol, returnPct: Math.round(ret * 100) });
        // reduce the lot
        const consumed = Math.min(qtySold, lot.shares);
        lot.cost -= avgCost * consumed;
        lot.shares -= consumed;
      }
    }
  }
  exitExamples.sort((a, b) => Math.abs(b.returnPct) - Math.abs(a.returnPct));

  // Options scorecard — group by option symbol, net the cashflows.
  const optGroups: Record<string, { net: number; expired: boolean }> = {};
  for (const t of optionTrades) {
    const g = optGroups[t.symbol] ?? (optGroups[t.symbol] = { net: 0, expired: false });
    g.net += t.amount ?? 0;                       // buys negative, sells positive
    if (t.action_type === 'EXPIRED') g.expired = true;
  }
  const optList = Object.entries(optGroups);
  const expiredWorthless = optList.filter(([, g]) => g.expired && g.net < 0).length;
  const netPremium = optList.reduce((s, [, g]) => s + g.net, 0);
  const closedOpts = optList.filter(([, g]) => g.net !== 0);
  const optWins = closedOpts.filter(([, g]) => g.net > 0).length;
  const worst = optList.slice().sort((a, b) => a[1].net - b[1].net)[0];

  // Cadence by year
  const yearCounts: Record<number, number> = {};
  for (const t of trades) { const y = Math.floor(dateKey(t.run_date) / 10000); if (y) yearCounts[y] = (yearCounts[y] ?? 0) + 1; }
  const years = Object.keys(yearCounts).map(Number).sort((a, b) => a - b);
  const busiest = Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0];

  return {
    total: trades.length, buys: buys.length, sells: sells.length, optionsCount: optionTrades.length,
    buySellRatio: sells.length > 0 ? buys.length / sells.length : buys.length,
    distinctSymbols: rankedTickers.length,
    topTicker,
    concentrationPct: topTicker ? pct(topTicker.count, trades.length) : 0,
    dcaTickers,
    exits: {
      matched, winners, losers,
      avgReturnPct: matched > 0 ? Math.round((retSum / matched) * 100) : null,
      examples: exitExamples.slice(0, 4),
    },
    options: {
      contracts: optList.length, expiredWorthless, netPremium,
      winRate: closedOpts.length > 0 ? pct(optWins, closedOpts.length) : null,
      worst: worst ? { symbol: worst[0], net: worst[1].net } : null,
    },
    firstYear: years[0] ?? null, lastYear: years[years.length - 1] ?? null,
    busiestYear: busiest ? { year: +busiest[0], count: busiest[1] } : null,
  };
}

// ── Annotation themes (driven by the data-defined taxonomy) ──────────────────

function scoreText(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0);
}

interface ThemeScore { trait: BehaviorTrait; score: number; evidence: string[]; buyScore: number; sellScore: number; }

function scoreThemes(trades: Investment[], traits: BehaviorTrait[]): ThemeScore[] {
  return traits.map(trait => {
    let score = 0, buyScore = 0, sellScore = 0; const evidence: string[] = [];
    for (const t of trades) {
      const text = annotationText(t);
      if (!text) continue;
      const hit = scoreText(text, trait.keywords);
      if (hit > 0) {
        score += hit;
        if (isBuy(t)) buyScore += hit; else if (isSell(t)) sellScore += hit;
        if (evidence.length < 4 && !evidence.includes(t.symbol)) evidence.push(t.symbol);
      }
    }
    return { trait, score, evidence, buyScore, sellScore };
  }).filter(t => t.score > 0).sort((a, b) => b.score - a.score);
}

// English stopwords + trade vocabulary that should never become an "emerging theme".
const STOPWORDS = new Set(('a an the and or but if then this that these those i me my we our you your it its is are was were be been being to of in on for with at by from as so it\'s im ive into out up down over under again more most some such no nor not only own same than too very can will just dont should now bought sold buy sell shares share stock position trade traded because want wanted get got make made keep kept since when while about they them their'.split(' ')));

function findEmergingThemes(trades: Investment[], traits: BehaviorTrait[]): EmergingTheme[] {
  const known = new Set(traits.flatMap(t => t.keywords.flatMap(k => k.split(/\s+/))));
  const freq: Record<string, { count: number; examples: string[] }> = {};
  for (const t of trades) {
    const text = annotationText(t);
    if (!text) continue;
    const words = text.toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter(Boolean);
    const seen = new Set<string>();
    for (const w of words) {
      if (w.length < 4 || STOPWORDS.has(w) || known.has(w)) continue;
      if (seen.has(w)) continue; // count each word once per trade
      seen.add(w);
      const e = freq[w] ?? (freq[w] = { count: 0, examples: [] });
      e.count++;
      if (e.examples.length < 3) e.examples.push(t.symbol);
    }
  }
  return Object.entries(freq)
    .filter(([, e]) => e.count >= 3)                // recurs across >=3 trades
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([term, e]) => ({ term, count: e.count, examples: e.examples }));
}

// ── Synthesis ────────────────────────────────────────────────────────────────

function structuralPatterns(s: StructuralSignals): AnalysisPattern[] {
  const out: AnalysisPattern[] = [];

  if (s.dcaTickers.length > 0) {
    out.push({
      name: 'Systematic Accumulation',
      description: `You build positions in layers rather than single shots — ${s.dcaTickers.length} ticker${s.dcaTickers.length > 1 ? 's were' : ' was'} bought three or more times. This is dollar-cost averaging in practice: conviction expressed through repetition, not timing.`,
      evidence: s.dcaTickers.slice(0, 4).map(d => `${d.symbol} ×${d.buys}`),
    });
  }
  if (s.buySellRatio >= 3 && s.buys >= 10) {
    out.push({
      name: 'Buy-and-Hold Bias',
      description: `You buy far more than you sell — ${s.buys} buys against ${s.sells} sells (≈${s.buySellRatio.toFixed(1)}:1). You are an accumulator at heart: positions go in and mostly stay in. The risk is that "hold" can quietly become "never reassess."`,
      evidence: [`${s.buys} buys`, `${s.sells} sells`],
    });
  }
  if (s.optionsCount >= 4) {
    const tone = (s.options.netPremium < 0) ? 'and they have cost you premium overall' : 'and they have roughly paid for themselves';
    out.push({
      name: 'Core-and-Satellite Speculation',
      description: `Alongside steady fund buying, you run ${s.options.contracts} options position${s.options.contracts > 1 ? 's' : ''} — short-dated, high-risk bets ${tone}. The structure (calm core, speculative edge) is sound; the edge just needs sizing discipline.`,
      evidence: [`${s.options.contracts} contracts`, s.options.netPremium < 0 ? `${money(s.options.netPremium)} net` : `${money(s.options.netPremium)} net`],
    });
  }
  if (s.exits.matched >= 3 && s.exits.avgReturnPct !== null) {
    const dir = s.exits.avgReturnPct >= 0 ? 'into gains' : 'while underwater';
    out.push({
      name: s.exits.winners >= s.exits.losers ? 'Sells Into Strength' : 'Cuts Losers',
      description: `Across ${s.exits.matched} matched stock exits, you sold ${dir} on average (${s.exits.avgReturnPct >= 0 ? '+' : ''}${s.exits.avgReturnPct}% vs cost basis) — ${s.exits.winners} winners and ${s.exits.losers} losers. ${s.exits.winners >= s.exits.losers ? 'You tend to realize gains rather than dump in fear.' : 'You are willing to take losses rather than hold and hope.'}`,
      evidence: s.exits.examples.map(e => `${e.symbol} ${e.returnPct >= 0 ? '+' : ''}${e.returnPct}%`),
    });
  }
  return out;
}

function buildBlindSpots(s: StructuralSignals, themes: ThemeScore[], annotated: number): string[] {
  const spots: string[] = [];

  if (s.options.expiredWorthless >= 2 || (s.options.netPremium < -100 && s.optionsCount >= 4)) {
    spots.push(`Options are a recurring leak — ${s.options.expiredWorthless} expired worthless and the book is ${money(s.options.netPremium)} net on premium${s.options.worst && s.options.worst.net < 0 ? ` (worst: ${s.options.worst.symbol} ${money(s.options.worst.net)})` : ''}. Size them as lottery tickets, not positions, and define max-loss before entering.`);
  }
  if (s.concentrationPct >= 18 && s.topTicker) {
    spots.push(`Heavy repeat activity in ${s.topTicker.symbol} (${s.concentrationPct}% of all trades). Deep familiarity with one name can quietly turn into overconfidence — make sure the thesis still earns the weight.`);
  }
  if (s.buySellRatio >= 4 && s.buys >= 15) {
    spots.push(`You almost never sell (${s.buys}:${s.sells} buy/sell). Buy-and-hold is a strength, but with no exit discipline winners and mistakes get treated identically — schedule a periodic "would I buy this today?" review.`);
  }
  const themeIds = new Set(themes.map(t => t.trait.id));
  if (annotated >= 8 && themeIds.has('momentum') && !themeIds.has('risk_management')) {
    spots.push('Your reasons show momentum/FOMO entries but no risk-management language — entries are well-documented while exits are not. The next edge is writing the exit plan at the moment you buy.');
  }
  if (annotated < 8) {
    spots.push(`Only ${annotated} of ${s.total} trades carry a written reason. The structural read above is solid, but the *why* behind each trade is where the sharpest blind spots hide — annotate a handful of your biggest trades to unlock them.`);
  }
  return spots.slice(0, 4);
}

function pickArchetype(s: StructuralSignals, themes: ThemeScore[]): [string, string] {
  // A dominant annotation theme wins if the reasons are rich enough.
  const top = themes[0];
  if (top && top.score >= 4 && top.trait.archetype) return top.trait.archetype;

  // Otherwise infer from structure.
  const indexHeavy = s.dcaTickers.length >= 3 && s.buySellRatio >= 3;
  const speculative = s.optionsCount >= 4;
  if (indexHeavy && speculative) return ['The Index Core, Speculative Edge', 'A calm, accumulating core wrapped around small high-risk bets — steady hands with a gambler\'s thumb.'];
  if (indexHeavy) return ['The Dollar-Cost Machine', 'Patient and systematic — keeps feeding core positions through the noise.'];
  if (s.buySellRatio >= 3) return ['The Conviction Holder', 'Buys and holds — positions go in on belief and rarely come back out.'];
  if (speculative) return ['The Satellite Speculator', 'Trades around a core with short-dated, asymmetric bets.'];
  return ['The Pragmatist', 'Adaptable and data-aware — no single style defines the approach yet.'];
}

function buildMetrics(s: StructuralSignals): AnalysisMetric[] {
  const m: AnalysisMetric[] = [];
  m.push({ label: 'Buy : Sell', value: `${s.buys} : ${s.sells}`, sub: s.buySellRatio >= 3 ? 'accumulator' : 'two-way trader', tone: 'neutral' });
  if (s.exits.avgReturnPct !== null) {
    m.push({
      label: 'Avg Realized Exit', value: `${s.exits.avgReturnPct >= 0 ? '+' : ''}${s.exits.avgReturnPct}%`,
      sub: `${s.exits.winners}W / ${s.exits.losers}L · ${s.exits.matched} matched`,
      tone: s.exits.avgReturnPct >= 0 ? 'good' : 'bad',
    });
  }
  if (s.optionsCount > 0) {
    m.push({
      label: 'Options Net', value: money(s.options.netPremium),
      sub: `${s.options.contracts} contracts · ${s.options.expiredWorthless} expired worthless`,
      tone: s.options.netPremium >= 0 ? 'good' : 'bad',
    });
  }
  if (s.topTicker) {
    m.push({ label: 'Concentration', value: `${s.concentrationPct}%`, sub: `top name: ${s.topTicker.symbol} · ${s.distinctSymbols} tickers`, tone: s.concentrationPct >= 20 ? 'warn' : 'good' });
  }
  return m;
}

// ── Public entry point ───────────────────────────────────────────────────────

export function analyzeBehavior(trades: Investment[], traits: BehaviorTrait[] = DEFAULT_TRAITS): BehaviorAnalysis {
  const s = computeStructural(trades);
  const themes = scoreThemes(trades, traits);
  const annotated = trades.filter(t => annotationText(t)).length;

  const [archetype, tagline] = pickArchetype(s, themes);

  // Patterns: structural backbone first, then enrich with the strongest themes.
  const patterns: AnalysisPattern[] = structuralPatterns(s);
  for (const th of themes.slice(0, 3)) {
    if (patterns.length >= 5) break;
    patterns.push({ name: th.trait.label, description: th.trait.pattern, evidence: th.evidence });
  }

  // Buy triggers: stated (from buy-side themes) + a structural default.
  const statedTriggers = themes.filter(t => t.buyScore > 0 && t.trait.buyTrigger).map(t => t.trait.buyTrigger!);
  const buy_triggers = statedTriggers.length > 0 ? statedTriggers.slice(0, 5)
    : [
        s.dcaTickers.length ? 'A position you already hold — you add on a schedule, not on news' : 'Conviction in a long-term thesis',
        'A broad fund or sector you want more exposure to',
      ];

  // Exit style: realized data first, enriched by sell-side annotation themes.
  const sellTheme = themes.find(t => t.sellScore > 0 && t.trait.exitNote);
  let exit_style: string;
  if (s.exits.matched >= 3 && s.exits.avgReturnPct !== null) {
    const tilt = s.exits.winners >= s.exits.losers
      ? `you tend to sell into strength (${s.exits.winners} of ${s.exits.matched} exits in profit, ${s.exits.avgReturnPct >= 0 ? '+' : ''}${s.exits.avgReturnPct}% average)`
      : `you are willing to realize losses (${s.exits.losers} of ${s.exits.matched} exits underwater)`;
    exit_style = `You sell rarely — ${s.sells} exits against ${s.buys} buys — and when you do, ${tilt}. ${sellTheme ? sellTheme.trait.exitNote : 'The pattern is restraint: positions earn their place and mostly stay.'}`;
  } else if (sellTheme) {
    exit_style = sellTheme.trait.exitNote!;
  } else {
    exit_style = `Selling is not your default move — ${s.buys} buys against ${s.sells} sells. Your exit behavior will sharpen as you annotate the sells you have made.`;
  }

  return {
    archetype, tagline, patterns: patterns.slice(0, 5), buy_triggers, exit_style,
    blind_spots: buildBlindSpots(s, themes, annotated),
    metrics: buildMetrics(s),
    emerging_themes: findEmergingThemes(trades, traits),
    annotated_count: annotated,
    trade_count: trades.length,
    engine: 'local',
  };
}

/** Compact, model-readable summary of the structural signals — used to ground the AI prompt. */
export function structuralBrief(trades: Investment[]): string {
  const s = computeStructural(trades);
  const lines = [
    `Total trades: ${s.total} (${s.buys} buys, ${s.sells} sells, ${s.optionsCount} options legs). Buy:sell ≈ ${s.buySellRatio.toFixed(1)}:1.`,
    `Distinct tickers: ${s.distinctSymbols}. Most-traded: ${s.topTicker ? `${s.topTicker.symbol} (${s.concentrationPct}% of trades)` : 'n/a'}.`,
    s.dcaTickers.length ? `Repeatedly accumulated (DCA): ${s.dcaTickers.slice(0, 6).map(d => `${d.symbol}×${d.buys}`).join(', ')}.` : '',
    s.exits.matched ? `Matched stock exits: ${s.exits.matched} (${s.exits.winners} winners, ${s.exits.losers} losers, avg ${s.exits.avgReturnPct}% vs cost basis).` : 'No stock exits could be matched to a cost basis.',
    s.optionsCount ? `Options: ${s.options.contracts} contracts, ${s.options.expiredWorthless} expired worthless, net premium ${money(s.options.netPremium)}, win rate ${s.options.winRate ?? 'n/a'}%.` : '',
    s.busiestYear ? `Active ${s.firstYear}–${s.lastYear}; busiest year ${s.busiestYear.year} (${s.busiestYear.count} trades).` : '',
  ].filter(Boolean);
  return lines.join('\n');
}
