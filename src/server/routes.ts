import type { IncomingMessage, ServerResponse } from "http";
import type { TodoDatabase } from "../database/database.js";
import type { ConfigManager } from "../core/config-manager.js";
import { ReceiptGenerator } from "../core/receipt-generator.js";
import { HtmlRenderer } from "../core/html-renderer.js";
import { ThermalPrinterRenderer } from "../core/thermal-printer.js";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { dirname, resolve, join } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || join(homedir(), '.todo-receipts');
const IMAGES_DIR = join(DATA_DIR, 'images');

// ── Local behavioral analysis (no API key required) ──────────────────────────

import type { Investment } from "../database/schema.js";

const THEMES: Record<string, string[]> = {
  dip_buying:      ['dip', 'drop', 'dropped', 'fell', 'down', 'cheap', 'lower', 'pullback', 'discount', 'undervalued', 'correction', 'sold off', 'sell-off', 'oversold'],
  long_term:       ['long term', 'long-term', 'hold', 'thesis', 'fundamental', 'growth', 'future', 'believe', 'conviction', 'years', 'patient', 'core position', 'hold forever'],
  diversification: ['diversif', 'index', 'etf', 'broad', 'exposure', 'rebalanc', 'hedge', 'balanced', 'spread', 'allocation'],
  averaging:       ['average', 'avg', 'dca', 'dollar cost', 'adding more', 'add more', 'accumulate', 'cost basis', 'keep buying', 'buying more'],
  momentum:        ['fomo', 'momentum', 'trending', 'hot', 'run', 'rally', 'surge', 'hype', 'breakout', 'moving', 'up big', 'on a run', 'going up'],
  income:          ['dividend', 'income', 'yield', 'distribution', 'passive', 'payout'],
  news_driven:     ['earnings', 'news', 'catalyst', 'report', 'event', 'launch', 'announcement', 'beat', 'guidance'],
  risk_management: ['stop loss', 'limit', 'protect', 'defensive', 'safe', 'reduce risk', 'trim', 'too much exposure', 'rebalance'],
  profit_taking:   ['profit', 'gain', 'up', 'return', 'selling high', 'take some off', 'lock in', 'target reached', 'goal met'],
};

function scoreText(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0);
}

function topTickers(trades: Investment[], n = 3): string[] {
  const counts: Record<string, number> = {};
  for (const t of trades) counts[t.symbol] = (counts[t.symbol] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([s]) => s);
}

function analyzeInvestmentsLocally(trades: Investment[]) {
  const buys  = trades.filter(t => t.action_type === 'BUY' || t.action_type === 'OPTIONS_BUY');
  const sells = trades.filter(t => t.action_type === 'SELL' || t.action_type === 'OPTIONS_SELL' || t.action_type === 'EXPIRED');

  // Score every trade's combined text against each theme
  const themeScores: Record<string, number> = {};
  const themeEvidence: Record<string, string[]> = {};
  for (const [theme, keywords] of Object.entries(THEMES)) {
    themeScores[theme] = 0;
    themeEvidence[theme] = [];
    for (const t of trades) {
      const text = [t.reason ?? '', t.future_goal ?? ''].join(' ');
      const hit = scoreText(text, keywords);
      if (hit > 0) {
        themeScores[theme] += hit;
        if (themeEvidence[theme].length < 3) themeEvidence[theme].push(t.symbol);
      }
    }
  }

  const ranked = Object.entries(themeScores)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]);

  const top = ranked.slice(0, 5).map(([theme]) => theme);
  const dominant = top[0] ?? 'long_term';

  // Archetype
  const archetypeMap: Record<string, [string, string]> = {
    dip_buying:      ['The Dip Buyer',       'Buys fear, holds conviction — waiting for the market to prove itself wrong.'],
    long_term:       ['The Conviction Holder','Slow, deliberate, and thesis-driven — built for the long game, not the next quarter.'],
    diversification: ['The Index Architect',  'Methodical and measured — spreading risk across sectors before concentrating anywhere.'],
    averaging:       ['The Dollar-Cost Machine','Patient and systematic — keeps feeding positions regardless of short-term noise.'],
    momentum:        ['The Momentum Chaser',  'Follows price action and energy — gets in when things are moving, not before.'],
    income:          ['The Yield Hunter',     'Buys for cash flow — dividends and distributions are the thesis, not just a bonus.'],
    news_driven:     ['The Catalyst Trader',  'Event-driven and reactive — enters when there\'s a clear trigger, not just a feeling.'],
    risk_management: ['The Risk Manager',     'Thinks in exits before entries — every position has a defined limit.'],
    profit_taking:   ['The Disciplined Trimmer','Sets targets and actually hits them — doesn\'t let winners run into regret.'],
  };

  const [archetype, tagline] = archetypeMap[dominant] ?? ['The Pragmatist', 'Adaptable and data-aware — no single style defines the approach.'];

  // Build patterns from top themes
  const patternDescriptions: Record<string, string> = {
    dip_buying:      'You consistently step in when prices are down, treating market fear as an entry signal. This shows patience and contrarian instinct — but watch for catching falling knives without a recovery thesis.',
    long_term:       'Your annotations reveal a thesis-first mindset. You buy when you believe in the story, not the price action, and your goals are measured in years. This is the backbone of most great investor profiles.',
    diversification: 'You deliberately spread exposure across sectors and asset classes. This suggests an awareness of concentration risk and a preference for stable compounding over high-conviction single-stock bets.',
    averaging:       'You return to the same positions over time, lowering your cost basis and adding conviction incrementally. Dollar-cost averaging is your default move when you believe in the direction but not the timing.',
    momentum:        'Some of your trades are driven by price action and energy — you enter when things are already moving. This can capture real upside but also creates FOMO risk if not paired with a clear thesis.',
    income:          'Dividends and yield are a recurring theme. You think about returns in terms of cash flow, not just price appreciation — a sign of long-term portfolio planning.',
    news_driven:     'Earnings, launches, and catalysts pull you in. You\'re watching for triggers that justify a move, which can be disciplined — or reactive depending on the source.',
    risk_management: 'You think about exits before you enter. Trimming, hedging, and reducing exposure feature in your reasoning — a sign of portfolio-level thinking, not just stock-picking.',
    profit_taking:   'You actually sell when you hit targets. Locking in gains is a skill most investors underuse — your annotations suggest you\'ve built this habit.',
  };

  const patterns = top.slice(0, 4).map(theme => ({
    name: theme.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: patternDescriptions[theme] ?? 'A recurring pattern in your trade reasoning.',
    evidence: [...new Set(themeEvidence[theme])].slice(0, 4),
  }));

  // Buy triggers from buy-side themes
  const buyThemes = ['dip_buying', 'averaging', 'momentum', 'news_driven', 'long_term', 'income', 'diversification'];
  const buyTriggers = buyThemes
    .filter(t => themeScores[t] > 0 && (buys.some(b => scoreText([b.reason ?? '', b.future_goal ?? ''].join(' '), THEMES[t]) > 0)))
    .slice(0, 5)
    .map(t => ({
      dip_buying:      'Price is down — you see an entry, not a warning',
      averaging:       'Already holding — time to lower the cost basis',
      momentum:        'Price action is strong and confirming',
      news_driven:     'Earnings or catalyst creates a clear trigger',
      long_term:       'Conviction in the thesis, regardless of short-term price',
      income:          'Dividend or yield justifies the position',
      diversification: 'Portfolio needs exposure to this sector or asset class',
    }[t] ?? t));

  // Exit style from sell-side annotations
  const sellAnnotated = sells.filter(t => t.reason || t.future_goal);
  const exitThemeScores: Record<string, number> = {};
  for (const t of sellAnnotated) {
    const text = [t.reason ?? '', t.future_goal ?? ''].join(' ');
    for (const [theme, keywords] of Object.entries(THEMES)) {
      exitThemeScores[theme] = (exitThemeScores[theme] ?? 0) + scoreText(text, keywords);
    }
  }
  const topExitTheme = Object.entries(exitThemeScores).sort((a, b) => b[1] - a[1])[0]?.[0];
  const exitStyleMap: Record<string, string> = {
    profit_taking:   'You exit when targets are hit — disciplined and pre-planned. Sells are often clean decisions, not emotional ones.',
    risk_management: 'You sell to manage exposure and reduce risk. Exits are defensive and deliberate, not reactive to panic.',
    diversification: 'You rebalance rather than abandon — sells are usually rotations, not full exits from a thesis.',
    long_term:       'You rarely sell, and when you do it\'s because the thesis has changed, not just the price.',
    news_driven:     'Catalysts trigger exits as much as entries — you sell when the event has played out or the story changes.',
    dip_buying:      'You tend to hold through dips rather than exit — selling isn\'t your default move.',
  };
  const exitStyle = sellAnnotated.length === 0
    ? 'Most of your annotated trades are buys — your exit behavior is still being decoded as you add sell annotations.'
    : exitStyleMap[topExitTheme ?? ''] ?? 'Your exits are deliberate but varied — no single pattern dominates your sell behavior yet.';

  // Blind spots
  const blindSpots: string[] = [];
  const sellRatio = sells.length / (trades.length || 1);
  if (sellAnnotated.length < sellRatio * trades.length * 0.3) {
    blindSpots.push('Exit reasoning is underdeveloped — most annotated trades are buys, leaving sell decisions under-documented');
  }
  if (themeScores['momentum'] > themeScores['long_term'] * 0.6) {
    blindSpots.push('Momentum-driven entries can blur the line between a thesis and FOMO — worth auditing which is which');
  }
  const tickerCounts: Record<string, number> = {};
  for (const t of trades) tickerCounts[t.symbol] = (tickerCounts[t.symbol] ?? 0) + 1;
  const topTicker = Object.entries(tickerCounts).sort((a, b) => b[1] - a[1])[0];
  if (topTicker && topTicker[1] > trades.length * 0.15) {
    blindSpots.push(`Heavy repeat trading in ${topTicker[0]} — high familiarity can become overconfidence`);
  }
  if (themeScores['dip_buying'] > 0 && themeScores['risk_management'] === 0) {
    blindSpots.push('Dip-buying without documented stop-loss reasoning means entries have no defined exit floor');
  }
  if (blindSpots.length === 0) {
    blindSpots.push('Annotation coverage is still building — the clearer your reasons, the sharper the blind spots become');
  }

  return {
    archetype,
    tagline,
    patterns,
    buy_triggers: buyTriggers.length > 0 ? buyTriggers : ['Conviction in a long-term thesis', 'Price creates a compelling entry point'],
    exit_style: exitStyle,
    blind_spots: blindSpots.slice(0, 3),
    annotated_count: trades.length,
    engine: 'local',
  };
}

export class ApiRouter {
  constructor(
    private db: TodoDatabase,
    private configManager: ConfigManager,
  ) {}

  async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const rawUrl = req.url || "/";
    const method = req.method || "GET";

    // Parse URL to separate pathname from query string
    const parsedUrl = new URL(rawUrl, "http://localhost");
    const pathname = parsedUrl.pathname;

    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // Dashboard HTML
      if (pathname === "/" && method === "GET") {
        await this.serveDashboard(res);
        return;
      }

      // Dashboard JavaScript
      if (pathname === "/dashboard.js" && method === "GET") {
        await this.serveDashboardJs(res);
        return;
      }

      // Favicon
      if (pathname === "/favicon.svg" && method === "GET") {
        await this.serveFavicon(res);
        return;
      }

      // Custom font
      if (pathname === "/Ashni-Regular.ttf" && method === "GET") {
        await this.serveFont(res);
        return;
      }

      // Profiles route
      if (pathname === "/api/profiles" && method === "GET") {
        this.sendJson(res, { profiles: [{ id: 'ashni', name: 'Ashni' }, { id: 'nirav', name: 'Nirav' }] });
        return;
      }

      // Suggestions route (before /api/todos to avoid conflicts)
      if (pathname === "/api/suggestions" && method === "GET") {
        const category = parsedUrl.searchParams.get("category") || "General";
        const userId = parsedUrl.searchParams.get("user") || 'ashni';
        await this.getSuggestions(res, category, userId);
        return;
      }

      // API routes
      if (pathname === "/api/todos" && method === "GET") {
        const category = parsedUrl.searchParams.get("category") || undefined;
        const date = parsedUrl.searchParams.get("date") || undefined;
        const userId = parsedUrl.searchParams.get("user") || 'ashni';
        await this.getTodos(res, category, date, userId);
        return;
      }

      if (pathname === "/api/todos" && method === "POST") {
        await this.createTodo(req, res);
        return;
      }

      if (pathname === "/api/todos/reorder" && method === "POST") {
        await this.reorderTodos(req, res);
        return;
      }

      if (pathname.startsWith("/api/todos/") && method === "PUT") {
        const id = this.extractId(pathname);
        await this.updateTodo(req, res, id);
        return;
      }

      if (pathname.startsWith("/api/todos/") && method === "DELETE") {
        const id = this.extractId(pathname);
        await this.deleteTodo(res, id);
        return;
      }

      // Period tracker routes
      if (pathname === "/api/period" && method === "GET") {
        const userId = parsedUrl.searchParams.get("user") || "ashni";
        const logs = this.db.getPeriodLogs(userId);
        this.sendJson(res, { logs });
        return;
      }

      if (pathname === "/api/period" && method === "POST") {
        await this.createPeriodLog(req, res);
        return;
      }

      if (pathname.startsWith("/api/period/") && method === "DELETE") {
        const date = pathname.slice("/api/period/".length);
        const userId = parsedUrl.searchParams.get("user") || "ashni";
        this.db.deletePeriodLog(userId, date);
        this.sendJson(res, { success: true });
        return;
      }

      if (pathname === "/api/print" && method === "POST") {
        await this.printReceipt(req, res);
        return;
      }

      if (pathname === "/api/print/pending" && method === "GET") {
        await this.getPendingJobs(res);
        return;
      }

      if (pathname.match(/^\/api\/print\/\d+\/complete$/) && method === "POST") {
        const id = parseInt(pathname.split("/")[3], 10);
        await this.completePrintJob(res, id);
        return;
      }

      // Movie routes
      if (pathname === '/api/movies' && method === 'GET') {
        this.sendJson(res, { movies: this.db.getMovies() });
        return;
      }

      if (pathname === '/api/movies/search' && method === 'GET') {
        await this.searchMovies(res, parsedUrl.searchParams.get('q') || '');
        return;
      }

      if (pathname === '/api/movies' && method === 'POST') {
        await this.createMovie(req, res);
        return;
      }

      if (pathname.startsWith('/api/movies/') && method === 'DELETE') {
        const id = this.extractId(pathname);
        this.db.deleteMovie(id);
        this.sendJson(res, { success: true });
        return;
      }

      // Serve stored images
      if (pathname.startsWith('/api/images/') && method === 'GET') {
        await this.serveImage(res, pathname.slice('/api/images/'.length));
        return;
      }

      // Investment routes
      if (pathname === '/api/investments' && method === 'GET') {
        const account = parsedUrl.searchParams.get('account') || undefined;
        const transactions = this.db.getInvestments(account);
        this.sendJson(res, { transactions });
        return;
      }

      if (pathname === '/api/investments/clear' && method === 'DELETE') {
        const deleted = this.db.clearInvestments();
        this.sendJson(res, { deleted });
        return;
      }

      if (pathname === '/api/investments/import' && method === 'POST') {
        const body = await this.parseBody(req);
        if (!Array.isArray(body.transactions)) {
          this.sendError(res, 400, 'transactions array required');
          return;
        }
        const result = this.db.importInvestments(body.transactions);
        this.sendJson(res, result);
        return;
      }

      if (pathname === '/api/investments/patterns' && method === 'GET') {
        const patterns = this.db.getInvestmentPatterns();
        this.sendJson(res, patterns);
        return;
      }

      if (pathname.startsWith('/api/investments/') && method === 'PUT') {
        const id = this.extractId(pathname);
        const body = await this.parseBody(req);
        const updates: { reason?: string | null; future_goal?: string | null } = {};
        if (body.reason !== undefined) updates.reason = body.reason || null;
        if (body.future_goal !== undefined) updates.future_goal = body.future_goal || null;
        this.db.updateInvestment(id, updates);
        this.sendJson(res, { success: true });
        return;
      }

      if (pathname === '/api/investments/analyze' && method === 'GET') {
        const cached = this.db.getCachedAnalysis();
        this.sendJson(res, cached ? { analysis: JSON.parse(cached.value), cached_at: cached.created_at } : { analysis: null });
        return;
      }

      if (pathname === '/api/investments/analyze' && method === 'POST') {
        const annotated = this.db.getAnnotatedInvestments();
        if (annotated.length < 10) {
          this.sendError(res, 400, 'Not enough annotated trades to analyze');
          return;
        }

        let analysis: object;
        const apiKey = process.env.ANTHROPIC_API_KEY;

        if (apiKey) {
          const client = new Anthropic({ apiKey });
          const tradeLines = annotated.map(t => {
            const parts = [
              `${t.run_date} | ${t.action_type} | ${t.symbol}`,
              t.amount != null ? `$${Math.abs(t.amount).toFixed(0)}` : '',
              t.reason ? `Reason: "${t.reason}"` : '',
              t.future_goal ? `Goal: "${t.future_goal}"` : '',
            ].filter(Boolean);
            return parts.join(' | ');
          }).join('\n');

          const message = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1500,
            messages: [{
              role: 'user',
              content: `You are analyzing the trading psychology of an individual investor based on their annotated trade history. Each trade has the date, action, ticker, amount, and the investor's own reason/goal written in their own words.

Here are ${annotated.length} annotated trades (out of their full history):

${tradeLines}

Analyze this data and return a JSON object with this exact structure:
{
  "archetype": "short name for their trading personality (e.g. 'The Conviction Holder', 'The Dip Buyer')",
  "tagline": "one punchy sentence that captures their style",
  "patterns": [
    {
      "name": "pattern name",
      "description": "2-3 sentence description of what drives this behavior, backed by the data",
      "evidence": ["specific ticker or trade that exemplifies this"]
    }
  ],
  "buy_triggers": ["concise trigger 1", "concise trigger 2", "..."],
  "exit_style": "1-2 sentences on how/when they sell",
  "blind_spots": ["potential risk or bias 1", "potential risk or bias 2"],
  "annotated_count": ${annotated.length}
}

Produce 3-5 patterns. Be specific and reference actual tickers and reasons from the data. Return only valid JSON, no other text.`
            }]
          });

          const raw = (message.content[0] as { type: string; text: string }).text.trim();
          const jsonStr = raw.startsWith('{') ? raw : raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
          analysis = JSON.parse(jsonStr);
        } else {
          analysis = analyzeInvestmentsLocally(annotated);
        }

        this.db.setCachedAnalysis(JSON.stringify(analysis));
        this.sendJson(res, { analysis, cached_at: Date.now() });
        return;
      }

      if (pathname === '/api/investments/analyze/clear' && method === 'DELETE') {
        this.db.clearCachedAnalysis();
        this.sendJson(res, { success: true });
        return;
      }

      // 404
      this.sendError(res, 404, "Not found");
    } catch (error) {
      console.error("Request error:", error);
      this.sendError(
        res,
        500,
        error instanceof Error ? error.message : "Internal server error",
      );
    }
  }

  private async serveDashboard(res: ServerResponse): Promise<void> {
    try {
      const templatePath = resolve(__dirname, "../templates/dashboard.html");
      const html = await readFile(templatePath, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    } catch (error) {
      this.sendError(res, 500, "Failed to load dashboard");
    }
  }

  private async serveDashboardJs(res: ServerResponse): Promise<void> {
    try {
      const jsPath = resolve(__dirname, "../templates/dashboard.js");
      const js = await readFile(jsPath, "utf-8");
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(js);
    } catch (error) {
      this.sendError(res, 500, "Failed to load dashboard script");
    }
  }

  private async serveFavicon(res: ServerResponse): Promise<void> {
    try {
      const svgPath = resolve(__dirname, "../templates/favicon.svg");
      const svg = await readFile(svgPath, "utf-8");
      res.writeHead(200, { "Content-Type": "image/svg+xml" });
      res.end(svg);
    } catch (error) {
      this.sendError(res, 500, "Failed to load favicon");
    }
  }

  private async serveFont(res: ServerResponse): Promise<void> {
    try {
      const fontPath = resolve(__dirname, "../templates/Ashni-Regular.ttf");
      const font = await readFile(fontPath);
      res.writeHead(200, { "Content-Type": "font/ttf", "Cache-Control": "public, max-age=31536000" });
      res.end(font);
    } catch (error) {
      this.sendError(res, 500, "Failed to load font");
    }
  }

  private async getTodos(res: ServerResponse, category?: string, date?: string, userId?: string): Promise<void> {
    if (date) this.db.ensureRecurringTasks(date, userId);
    const todos = this.db.getAllTodos(category, date, userId);
    this.sendJson(res, { todos });
  }

  private async getSuggestions(res: ServerResponse, category: string, userId: string = 'ashni'): Promise<void> {
    const suggestions = this.db.getTaskSuggestions(category, userId);
    this.sendJson(res, { suggestions });
  }

  private async createTodo(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await this.parseBody(req);
    const { title, category, priority, time_estimate, scheduled_date, user } = body;

    if (!title || typeof title !== "string" || title.trim() === "") {
      this.sendError(res, 400, "Title is required");
      return;
    }

    const todo = this.db.createTodo(
      title.trim(),
      category || 'General',
      priority || 'medium',
      time_estimate || '',
      scheduled_date || undefined,
      user || 'ashni'
    );
    this.sendJson(res, { todo });
  }

  private async updateTodo(
    req: IncomingMessage,
    res: ServerResponse,
    id: number,
  ): Promise<void> {
    const body = await this.parseBody(req);

    const updates: {
      title?: string;
      completed?: boolean;
      category?: string;
      priority?: 'high' | 'medium' | 'low';
      time_estimate?: string;
      scheduled_date?: string;
    } = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.completed !== undefined) updates.completed = body.completed;
    if (body.category !== undefined) updates.category = body.category;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.time_estimate !== undefined) updates.time_estimate = body.time_estimate;
    if (body.scheduled_date !== undefined) updates.scheduled_date = body.scheduled_date;

    const todo = this.db.updateTodo(id, updates);
    this.sendJson(res, { todo });
  }

  private async deleteTodo(res: ServerResponse, id: number): Promise<void> {
    this.db.deleteTodo(id);
    this.sendJson(res, { success: true });
  }

  private async reorderTodos(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await this.parseBody(req);
    const { orderedIds } = body;

    if (!Array.isArray(orderedIds)) {
      this.sendError(res, 400, "orderedIds must be an array");
      return;
    }

    this.db.reorderTodos(orderedIds);
    this.sendJson(res, { success: true });
  }

  private async createPeriodLog(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const { date, flow, symptoms, notes, user } = body;
    if (!date || typeof date !== "string") {
      this.sendError(res, 400, "date is required");
      return;
    }
    const log = this.db.upsertPeriodLog(
      user || "ashni",
      date,
      flow || null,
      Array.isArray(symptoms) ? symptoms : [],
      notes || ""
    );
    this.sendJson(res, { log });
  }

  private async printReceipt(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let userId = 'ashni';
    let date: string | undefined;
    let themeId = 'ops';
    let category: string | undefined;
    try {
      const body = await this.parseBody(req);
      if (body.user) userId = body.user;
      if (body.date) date = body.date;
      if (body.theme) themeId = body.theme;
      if (body.category) category = body.category;
    } catch { /* no body is fine */ }
    const todos = this.db.getAllTodos(category, date, userId);
    const jobId = this.db.createPrintJob(todos, themeId);
    this.sendJson(res, { success: true, jobId, queued: true });
  }

  private async getPendingJobs(res: ServerResponse): Promise<void> {
    const jobs = this.db.getPendingJobs();
    this.sendJson(res, { jobs });
  }

  private async completePrintJob(res: ServerResponse, id: number): Promise<void> {
    this.db.completePrintJob(id);
    this.sendJson(res, { success: true });
  }

  private extractId(pathname: string): number {
    const parts = pathname.split("/");
    const id = parseInt(parts[parts.length - 1], 10);
    if (isNaN(id)) {
      throw new Error("Invalid ID");
    }
    return id;
  }

  private async parseBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("Invalid JSON"));
        }
      });
      req.on("error", reject);
    });
  }

  private sendJson(res: ServerResponse, data: any): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }

  private sendError(
    res: ServerResponse,
    code: number,
    message: string,
  ): void {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  }

  private async searchMovies(res: ServerResponse, query: string): Promise<void> {
    if (!query.trim()) { this.sendJson(res, { results: [] }); return; }
    const token = process.env.TMDB_TOKEN;
    if (!token) { this.sendError(res, 503, 'TMDB_TOKEN not configured'); return; }
    const tmdbRes = await fetch(
      `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&include_adult=false`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await tmdbRes.json() as { results?: Array<{ title: string; poster_path: string; release_date: string }> };
    const results = (data.results || [])
      .filter(r => r.poster_path)
      .slice(0, 10)
      .map(r => ({
        title: r.title,
        posterUrl: `https://image.tmdb.org/t/p/w500${r.poster_path}`,
        year: r.release_date ? r.release_date.slice(0, 4) : '',
      }));
    this.sendJson(res, { results });
  }

  private async createMovie(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const { title, posterUrl, language } = body;
    if (!posterUrl) { this.sendError(res, 400, 'posterUrl required'); return; }
    const movie = this.db.addMovie(title || '', posterUrl, language || 'english');
    this.sendJson(res, { movie });
  }

  private async serveImage(res: ServerResponse, filename: string): Promise<void> {
    // Security: no path traversal
    if (!filename || filename.includes('/') || filename.includes('..')) {
      this.sendError(res, 400, 'Invalid filename');
      return;
    }
    try {
      const imagePath = join(IMAGES_DIR, filename);
      const data = await readFile(imagePath);
      const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
      const contentType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000' });
      res.end(data);
    } catch {
      this.sendError(res, 404, 'Image not found');
    }
  }
}
