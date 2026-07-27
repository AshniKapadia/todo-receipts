import Database from "better-sqlite3";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { dirname } from "path";
import type { TodoItem, PeriodLog, MovieItem, Investment, RejectionChallenge, HabitCard, ForecastLog } from "./schema.js";
import { CREATE_TABLE_SQL } from "./schema.js";
import { DEFAULT_TRAITS, type BehaviorTrait } from "../server/behavioral-analysis.js";

export class TodoDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdir(dir, { recursive: true }).catch((err) => {
        throw new Error(`Failed to create database directory: ${err.message}`);
      });
    }

    // Open database connection
    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrency
    this.db.pragma("journal_mode = WAL");

    // Initialize schema
    this.db.exec(CREATE_TABLE_SQL);

    // Run migrations
    this.runMigrations();

    // Seed the rejection-therapy starter asks once (guarded by a kv flag so
    // deleting them doesn't resurrect them on the next boot).
    this.ensureRejectionSeed();

    // Seed a couple of example Punch Card habits once.
    this.ensureWorldsSeed();
  }

  /**
   * Run database migrations
   */
  private runMigrations(): void {
    const tableInfo = this.db.pragma("table_info(todos)") as Array<{ name: string }>;

    // Migration 1: Add order_position column
    const hasOrderColumn = tableInfo.some(col => col.name === 'order_position');
    if (!hasOrderColumn) {
      this.db.exec("ALTER TABLE todos ADD COLUMN order_position INTEGER DEFAULT 0");
      this.db.exec(`
        UPDATE todos
        SET order_position = (
          SELECT COUNT(*)
          FROM todos t2
          WHERE t2.created_at <= todos.created_at
        )
      `);
    }

    // Migration 2: Add category column
    const hasCategoryColumn = tableInfo.some(col => col.name === 'category');
    if (!hasCategoryColumn) {
      this.db.exec("ALTER TABLE todos ADD COLUMN category TEXT DEFAULT 'General'");
    }

    // Migration 3: Add priority column
    const hasPriorityColumn = tableInfo.some(col => col.name === 'priority');
    if (!hasPriorityColumn) {
      this.db.exec("ALTER TABLE todos ADD COLUMN priority TEXT DEFAULT 'medium'");
    }

    // Migration 4: Add time_estimate column
    const hasTimeEstimate = tableInfo.some(col => col.name === 'time_estimate');
    if (!hasTimeEstimate) {
      this.db.exec("ALTER TABLE todos ADD COLUMN time_estimate TEXT DEFAULT ''");
    }

    // Migration 5: Add scheduled_date column
    const hasScheduledDate = tableInfo.some(col => col.name === 'scheduled_date');
    if (!hasScheduledDate) {
      this.db.exec("ALTER TABLE todos ADD COLUMN scheduled_date TEXT DEFAULT NULL");
    }

    // Migration 6: Add user_id column
    const hasUserId = tableInfo.some(col => col.name === 'user_id');
    if (!hasUserId) {
      this.db.exec("ALTER TABLE todos ADD COLUMN user_id TEXT NOT NULL DEFAULT 'ashni'");
    }

    // Migration 7: Add theme_id to print_jobs
    const jobsInfo = this.db.pragma("table_info(print_jobs)") as Array<{ name: string }>;
    const hasThemeId = jobsInfo.some(col => col.name === 'theme_id');
    if (!hasThemeId) {
      this.db.exec("ALTER TABLE print_jobs ADD COLUMN theme_id TEXT DEFAULT 'ops'");
    }

    // Migration 9: forecast_logs — move from the old weather model (mood/energy)
    // to the mood-field model (valence/arousal/color). Only local test rows existed
    // and it was never deployed, so a clean recreate is safe.
    try {
      const fc = this.db.pragma("table_info(forecast_logs)") as Array<{ name: string }>;
      if (fc.length > 0 && !fc.some(c => c.name === 'valence')) {
        this.db.exec('DROP TABLE forecast_logs');
        this.db.exec(`
          CREATE TABLE forecast_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL UNIQUE,
            valence REAL DEFAULT 0.5,
            arousal REAL DEFAULT 0.5,
            color TEXT DEFAULT '',
            note TEXT DEFAULT '',
            created_at INTEGER NOT NULL
          )
        `);
      }
    } catch (e) {}

    // Migration 8: movie_posters — recreate if it has the old image_filename schema
    try {
      const movieInfo = this.db.pragma("table_info(movie_posters)") as Array<{ name: string }>;
      if (movieInfo.length > 0) {
        const hasOldSchema = movieInfo.some(c => c.name === 'image_filename');
        if (hasOldSchema) {
          // No data yet, safe to drop and recreate with correct schema
          this.db.exec('DROP TABLE movie_posters');
          this.db.exec(`
            CREATE TABLE movie_posters (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT DEFAULT '',
              poster_url TEXT NOT NULL DEFAULT '',
              language TEXT NOT NULL DEFAULT 'english',
              created_at INTEGER NOT NULL
            )
          `);
        } else {
          if (!movieInfo.some(c => c.name === 'language')) {
            this.db.exec("ALTER TABLE movie_posters ADD COLUMN language TEXT NOT NULL DEFAULT 'english'");
          }
        }
      }
    } catch(e) {}
  }

  /**
   * Get all todos, optionally filtered by category, scheduled_date, and/or user_id
   */
  getAllTodos(category?: string, date?: string, userId?: string): TodoItem[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (category && date) {
      // Include the requested category AND recurring tasks for this date
      conditions.push("(category = ? OR category = 'Recurring')");
      params.push(category);
    } else if (category) {
      conditions.push('category = ?');
      params.push(category);
    }
    if (date) {
      conditions.push('scheduled_date = ?');
      params.push(date);
    }
    if (userId) {
      conditions.push('user_id = ?');
      params.push(userId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const stmt = this.db.prepare(`
      SELECT id, title, completed, category, priority, time_estimate, order_position, created_at, updated_at, scheduled_date, user_id
      FROM todos
      ${whereClause}
      ORDER BY order_position ASC, created_at DESC
    `);

    const rows = stmt.all(...params) as Array<{
      id: number;
      title: string;
      completed: number;
      category: string;
      priority: string;
      time_estimate: string;
      order_position: number;
      created_at: number;
      updated_at: number;
      scheduled_date: string | null;
      user_id: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      completed: row.completed === 1,
      category: row.category || 'General',
      priority: (row.priority || 'medium') as 'high' | 'medium' | 'low',
      time_estimate: row.time_estimate || '',
      order: row.order_position,
      created_at: row.created_at,
      updated_at: row.updated_at,
      scheduled_date: row.scheduled_date ?? undefined,
      user_id: row.user_id || 'ashni',
    }));
  }

  /**
   * Create a new todo
   */
  createTodo(
    title: string,
    category: string = 'General',
    priority: 'high' | 'medium' | 'low' = 'medium',
    time_estimate: string = '',
    scheduled_date?: string,
    userId: string = 'ashni'
  ): TodoItem {
    const now = Date.now();

    // Get the current max order
    const maxOrderStmt = this.db.prepare("SELECT MAX(order_position) as max_order FROM todos");
    const maxOrderRow = maxOrderStmt.get() as { max_order: number | null };
    const newOrder = (maxOrderRow.max_order ?? -1) + 1;

    const stmt = this.db.prepare(`
      INSERT INTO todos (title, completed, category, priority, time_estimate, order_position, created_at, updated_at, scheduled_date, user_id)
      VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(title, category, priority, time_estimate, newOrder, now, now, scheduled_date ?? null, userId);

    return {
      id: result.lastInsertRowid as number,
      title,
      completed: false,
      category,
      priority,
      time_estimate,
      order: newOrder,
      created_at: now,
      updated_at: now,
      scheduled_date,
      user_id: userId,
    };
  }

  /**
   * Update a todo
   */
  updateTodo(
    id: number,
    updates: Partial<Omit<TodoItem, "id" | "created_at">>,
  ): TodoItem {
    const current = this.getTodoById(id);
    if (!current) {
      throw new Error(`Todo with id ${id} not found`);
    }

    const now = Date.now();
    const newTitle = updates.title ?? current.title;
    const newCompleted =
      updates.completed !== undefined ? updates.completed : current.completed;
    const newCategory = updates.category ?? current.category;
    const newPriority = updates.priority ?? current.priority;
    const newTimeEstimate = updates.time_estimate ?? current.time_estimate;
    const newOrder = updates.order ?? current.order;
    const newScheduledDate = updates.scheduled_date !== undefined ? updates.scheduled_date : current.scheduled_date;

    const stmt = this.db.prepare(`
      UPDATE todos
      SET title = ?, completed = ?, category = ?, priority = ?, time_estimate = ?, order_position = ?, updated_at = ?, scheduled_date = ?
      WHERE id = ?
    `);

    stmt.run(newTitle, newCompleted ? 1 : 0, newCategory, newPriority, newTimeEstimate, newOrder, now, newScheduledDate ?? null, id);

    return {
      id,
      title: newTitle,
      completed: newCompleted,
      category: newCategory,
      priority: newPriority,
      time_estimate: newTimeEstimate,
      order: newOrder,
      created_at: current.created_at,
      updated_at: now,
      scheduled_date: newScheduledDate,
      user_id: current.user_id,
    };
  }

  /**
   * Reorder todos - update multiple tasks' order at once
   */
  reorderTodos(orderedIds: number[]): void {
    const stmt = this.db.prepare(`
      UPDATE todos
      SET order_position = ?, updated_at = ?
      WHERE id = ?
    `);

    const now = Date.now();
    const transaction = this.db.transaction((ids: number[]) => {
      ids.forEach((id, index) => {
        stmt.run(index, now, id);
      });
    });

    transaction(orderedIds);
  }

  /**
   * Delete a todo
   */
  deleteTodo(id: number): void {
    const stmt = this.db.prepare("DELETE FROM todos WHERE id = ?");
    const result = stmt.run(id);

    if (result.changes === 0) {
      throw new Error(`Todo with id ${id} not found`);
    }
  }

  /**
   * Toggle completion status
   */
  toggleComplete(id: number): TodoItem {
    const current = this.getTodoById(id);
    if (!current) {
      throw new Error(`Todo with id ${id} not found`);
    }

    return this.updateTodo(id, { completed: !current.completed });
  }

  /**
   * Recurring task definitions
   * days: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
   */
  private static RECURRING: Array<{ title: string; time_estimate: string; days: number[] }> = [
    { title: 'Stand Up',      time_estimate: '30m', days: [1]             }, // Mon
    { title: 'Stand Up',      time_estimate: '15m', days: [3]             }, // Wed
    { title: 'Work Together', time_estimate: '1h',  days: [2, 4]          }, // Tue, Thu
  ];

  /**
   * Ensure recurring tasks exist for a given date and user.
   * Uses category 'Recurring' as a marker — if none exist for this date, inserts them.
   */
  ensureRecurringTasks(date: string, userId: string = 'ashni'): void {
    // Only inject for ashni
    if (userId !== 'ashni') return;

    // Check if already injected for this date
    const existing = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM todos WHERE scheduled_date = ? AND user_id = ? AND category = 'Recurring'`
    ).get(date, userId) as { cnt: number };
    if (existing.cnt > 0) return;

    // Get day of week from date string (YYYY-MM-DD)
    const [year, month, day] = date.split('-').map(Number);
    const dow = new Date(year, month - 1, day).getDay();

    const now = Date.now();
    const maxOrderRow = this.db.prepare('SELECT MAX(order_position) as m FROM todos').get() as { m: number | null };
    let order = (maxOrderRow.m ?? -1) + 1;

    const stmt = this.db.prepare(`
      INSERT INTO todos (title, completed, category, priority, time_estimate, order_position, created_at, updated_at, scheduled_date, user_id)
      VALUES (?, 0, 'Recurring', 'medium', ?, ?, ?, ?, ?, ?)
    `);

    for (const task of TodoDatabase.RECURRING) {
      if (task.days.includes(dow)) {
        stmt.run(task.title, task.time_estimate, order++, now, now, date, userId);
      }
    }
  }

  /**
   * Get top suggested task titles for a given category and user
   */
  getTaskSuggestions(category: string, userId: string = 'ashni'): string[] {
    const stmt = this.db.prepare(`
      SELECT title, COUNT(*) as cnt
      FROM todos
      WHERE category = ? AND user_id = ?
      GROUP BY title
      ORDER BY cnt DESC
      LIMIT 10
    `);
    const rows = stmt.all(category, userId) as Array<{ title: string; cnt: number }>;
    return rows.map(r => r.title);
  }

  /**
   * Get a todo by ID (private helper)
   */
  private getTodoById(id: number): TodoItem | null {
    const stmt = this.db.prepare(`
      SELECT id, title, completed, category, priority, time_estimate, order_position, created_at, updated_at, scheduled_date, user_id
      FROM todos
      WHERE id = ?
    `);

    const row = stmt.get(id) as
      | {
          id: number;
          title: string;
          completed: number;
          category: string;
          priority: string;
          time_estimate: string;
          order_position: number;
          created_at: number;
          updated_at: number;
          scheduled_date: string | null;
          user_id: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      title: row.title,
      completed: row.completed === 1,
      category: row.category || 'General',
      priority: (row.priority || 'medium') as 'high' | 'medium' | 'low',
      time_estimate: row.time_estimate || '',
      order: row.order_position,
      created_at: row.created_at,
      updated_at: row.updated_at,
      scheduled_date: row.scheduled_date ?? undefined,
      user_id: row.user_id || 'ashni',
    };
  }

  // ── Period Tracker ──────────────────────────────────────────────────────────

  getPeriodLogs(userId: string = 'ashni'): PeriodLog[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id, date, flow, symptoms, notes, created_at
      FROM period_logs
      WHERE user_id = ?
      ORDER BY date ASC
    `);
    const rows = stmt.all(userId) as Array<{
      id: number; user_id: string; date: string;
      flow: string | null; symptoms: string; notes: string; created_at: number;
    }>;
    return rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      date: r.date,
      flow: r.flow,
      symptoms: JSON.parse(r.symptoms || '[]'),
      notes: r.notes || '',
      created_at: r.created_at,
    }));
  }

  upsertPeriodLog(userId: string, date: string, flow: string | null, symptoms: string[], notes: string): PeriodLog {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO period_logs (user_id, date, flow, symptoms, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
        flow = excluded.flow,
        symptoms = excluded.symptoms,
        notes = excluded.notes
    `).run(userId, date, flow, JSON.stringify(symptoms), notes, now);

    const row = this.db.prepare(`
      SELECT id, user_id, date, flow, symptoms, notes, created_at
      FROM period_logs WHERE user_id = ? AND date = ?
    `).get(userId, date) as any;

    return {
      id: row.id,
      user_id: row.user_id,
      date: row.date,
      flow: row.flow,
      symptoms: JSON.parse(row.symptoms || '[]'),
      notes: row.notes || '',
      created_at: row.created_at,
    };
  }

  deletePeriodLog(userId: string, date: string): void {
    this.db.prepare(`DELETE FROM period_logs WHERE user_id = ? AND date = ?`).run(userId, date);
  }

  /**
   * Create a pending print job with the current todo list snapshot
   */
  createPrintJob(todos: TodoItem[], themeId: string = 'ops'): number {
    const stmt = this.db.prepare(
      "INSERT INTO print_jobs (status, todos_json, theme_id, created_at) VALUES ('pending', ?, ?, ?)"
    );
    const result = stmt.run(JSON.stringify(todos), themeId, Date.now());
    return result.lastInsertRowid as number;
  }

  /**
   * Get all pending print jobs
   */
  getPendingJobs(): Array<{ id: number; todos: TodoItem[]; theme_id: string; created_at: number }> {
    const stmt = this.db.prepare(
      "SELECT id, todos_json, theme_id, created_at FROM print_jobs WHERE status = 'pending' ORDER BY created_at ASC"
    );
    const rows = stmt.all() as Array<{ id: number; todos_json: string; theme_id: string; created_at: number }>;
    return rows.map((row) => ({
      id: row.id,
      todos: JSON.parse(row.todos_json),
      theme_id: row.theme_id ?? 'ops',
      created_at: row.created_at,
    }));
  }

  /**
   * Mark a print job as completed
   */
  completePrintJob(id: number): void {
    const stmt = this.db.prepare(
      "UPDATE print_jobs SET status = 'completed', completed_at = ? WHERE id = ?"
    );
    stmt.run(Date.now(), id);
  }

  // ── Movies ───────────────────────────────────────────────────────────────────

  getMovies(): MovieItem[] {
    return this.db.prepare('SELECT * FROM movie_posters ORDER BY created_at DESC').all() as MovieItem[];
  }

  addMovie(title: string, posterUrl: string, language: string = 'english'): MovieItem {
    const now = Date.now();
    const result = this.db.prepare(
      'INSERT INTO movie_posters (title, poster_url, language, created_at) VALUES (?, ?, ?, ?)'
    ).run(title, posterUrl, language, now);
    return { id: result.lastInsertRowid as number, title, poster_url: posterUrl, language, created_at: now };
  }

  deleteMovie(id: number): void {
    this.db.prepare('DELETE FROM movie_posters WHERE id = ?').run(id);
  }

  // ── Investments ──────────────────────────────────────────────────────────────

  importInvestments(transactions: Array<{
    account: string; run_date: string; action_type: string; symbol: string;
    description: string; price: number | null; quantity: number | null;
    amount: number | null; is_option: boolean; option_type: string | null;
    option_action: string | null; raw_action: string; fidelity_key: string;
  }>): { imported: number; duplicates: number; consolidated: number } {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO investments
      (account, run_date, action_type, symbol, description, price, quantity, amount,
       is_option, option_type, option_action, reason, future_goal, raw_action, fidelity_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)
    `);
    let imported = 0;
    let duplicates = 0;
    const now = Date.now();
    const run = this.db.transaction(() => {
      for (const t of transactions) {
        const result = stmt.run(
          t.account, t.run_date, t.action_type, t.symbol, t.description,
          t.price, t.quantity, t.amount, t.is_option ? 1 : 0,
          t.option_type, t.option_action, t.raw_action, t.fidelity_key, now
        );
        if (result.changes > 0) imported++; else duplicates++;
      }
    });
    run();
    const consolidated = this.consolidateSplitTransactions();
    return { imported, duplicates, consolidated };
  }

  private consolidateSplitTransactions(): number {
    // Fidelity splits a single trade into whole-share + fractional rows.
    // They share the same date/account/action/ticker but may have a 1-cent price difference.
    // Group by (date, account, action, symbol) — no price restriction — and merge any group with >1 row.
    const groups = this.db.prepare(`
      SELECT run_date, account, action_type, symbol
      FROM investments
      WHERE is_option = 0
      GROUP BY run_date, account, action_type, symbol
      HAVING COUNT(*) > 1
    `).all() as Array<{ run_date: string; account: string; action_type: string; symbol: string }>;

    if (!groups.length) return 0;

    let consolidated = 0;
    const merge = this.db.transaction(() => {
      for (const g of groups) {
        const rows = this.db.prepare(`
          SELECT id, quantity, amount, price, reason, future_goal
          FROM investments
          WHERE run_date = ? AND account = ? AND action_type = ? AND symbol = ? AND is_option = 0
          ORDER BY
            CASE WHEN reason IS NOT NULL OR future_goal IS NOT NULL THEN 0 ELSE 1 END ASC,
            ABS(COALESCE(quantity, 0)) DESC
        `).all(g.run_date, g.account, g.action_type, g.symbol) as Array<{
          id: number; quantity: number | null; amount: number | null; price: number | null;
          reason: string | null; future_goal: string | null;
        }>;

        if (rows.length < 2) continue;

        const keeper   = rows[0];
        const totalQty = rows.reduce((s, r) => s + Math.abs(r.quantity ?? 0), 0);
        const totalAmt = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
        const signedQty = (keeper.quantity ?? 0) >= 0 ? totalQty : -totalQty;
        // Weighted average execution price
        const avgPrice = totalQty > 0 ? Math.abs(totalAmt) / totalQty : keeper.price;

        this.db.prepare(`UPDATE investments SET quantity = ?, amount = ?, price = ? WHERE id = ?`)
          .run(signedQty, totalAmt, avgPrice, keeper.id);
        for (const r of rows.slice(1)) {
          this.db.prepare(`DELETE FROM investments WHERE id = ?`).run(r.id);
        }
        consolidated++;
      }
    });
    merge();
    return consolidated;
  }

  clearInvestments(): number {
    const result = this.db.prepare('DELETE FROM investments').run();
    return result.changes;
  }

  getInvestments(account?: string): Investment[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (account && account !== 'all') {
      conditions.push('account = ?');
      params.push(account);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db.prepare(`
      SELECT * FROM investments ${where}
      ORDER BY
        substr(run_date,7,4) DESC,
        substr(run_date,1,2) DESC,
        substr(run_date,4,2) DESC,
        id DESC
    `).all(...params) as any[];
    return rows.map(r => ({ ...r, is_option: r.is_option === 1 }));
  }

  updateInvestment(id: number, updates: { reason?: string | null; future_goal?: string | null }): void {
    const fields: string[] = [];
    const params: unknown[] = [];
    if (updates.reason !== undefined) { fields.push('reason = ?'); params.push(updates.reason); }
    if (updates.future_goal !== undefined) { fields.push('future_goal = ?'); params.push(updates.future_goal); }
    if (!fields.length) return;
    params.push(id);
    this.db.prepare(`UPDATE investments SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  }

  getAnnotatedInvestments(): Investment[] {
    return this.db.prepare(`
      SELECT * FROM investments
      WHERE (reason IS NOT NULL AND reason != '') OR (future_goal IS NOT NULL AND future_goal != '')
      ORDER BY run_date ASC
    `).all() as Investment[];
  }

  getCachedAnalysis(): { value: string; created_at: number } | null {
    return this.db.prepare(`SELECT value, created_at FROM kv_store WHERE key = 'investment_analysis'`).get() as { value: string; created_at: number } | null;
  }

  setCachedAnalysis(result: string): void {
    this.db.prepare(`INSERT OR REPLACE INTO kv_store (key, value, created_at) VALUES ('investment_analysis', ?, ?)`).run(result, Date.now());
  }

  clearCachedAnalysis(): void {
    this.db.prepare(`DELETE FROM kv_store WHERE key = 'investment_analysis'`).run();
  }

  // ── Behavior trait taxonomy (data-driven, no redeploy to extend) ─────────────

  /** Returns the stored taxonomy, seeding it from DEFAULT_TRAITS on first read. */
  getBehaviorTraits(): BehaviorTrait[] {
    const row = this.db.prepare(`SELECT value FROM kv_store WHERE key = 'behavior_traits'`).get() as { value: string } | undefined;
    if (!row) {
      this.setBehaviorTraits(DEFAULT_TRAITS);
      return DEFAULT_TRAITS;
    }
    try {
      const parsed = JSON.parse(row.value) as BehaviorTrait[];
      return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_TRAITS;
    } catch {
      return DEFAULT_TRAITS;
    }
  }

  setBehaviorTraits(traits: BehaviorTrait[]): void {
    this.db.prepare(`INSERT OR REPLACE INTO kv_store (key, value, created_at) VALUES ('behavior_traits', ?, ?)`)
      .run(JSON.stringify(traits), Date.now());
  }

  /** Add or replace a single trait by id; returns the full updated taxonomy. */
  upsertBehaviorTrait(trait: BehaviorTrait): BehaviorTrait[] {
    const traits = this.getBehaviorTraits().filter(t => t.id !== trait.id);
    traits.push(trait);
    this.setBehaviorTraits(traits);
    return traits;
  }

  getInvestmentPatterns(): {
    monthlyActivity: Array<{ month: string; buys: number; sells: number }>;
    tickerFrequency: Array<{ symbol: string; count: number; buys: number; sells: number }>;
    annotationProgress: { total: number; annotated: number };
    totalStats: { total: number; buys: number; sells: number; options: number };
    accountSplit: Array<{ account: string; count: number }>;
  } {
    const monthlyRows = this.db.prepare(`
      SELECT
        substr(run_date, 7, 4) || '-' || substr(run_date, 1, 2) as month,
        SUM(CASE WHEN action_type IN ('BUY','OPTIONS_BUY') THEN 1 ELSE 0 END) as buys,
        SUM(CASE WHEN action_type IN ('SELL','OPTIONS_SELL','EXPIRED') THEN 1 ELSE 0 END) as sells
      FROM investments
      GROUP BY month ORDER BY month ASC
    `).all() as Array<{ month: string; buys: number; sells: number }>;

    const tickerRows = this.db.prepare(`
      SELECT symbol,
        COUNT(*) as count,
        SUM(CASE WHEN action_type IN ('BUY','OPTIONS_BUY') THEN 1 ELSE 0 END) as buys,
        SUM(CASE WHEN action_type IN ('SELL','OPTIONS_SELL','EXPIRED') THEN 1 ELSE 0 END) as sells
      FROM investments GROUP BY symbol ORDER BY count DESC LIMIT 15
    `).all() as Array<{ symbol: string; count: number; buys: number; sells: number }>;

    const annotation = this.db.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN reason IS NOT NULL AND reason != '' THEN 1 ELSE 0 END) as annotated
      FROM investments
    `).get() as { total: number; annotated: number };

    const stats = this.db.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN action_type IN ('BUY','OPTIONS_BUY') THEN 1 ELSE 0 END) as buys,
        SUM(CASE WHEN action_type IN ('SELL','OPTIONS_SELL','EXPIRED') THEN 1 ELSE 0 END) as sells,
        SUM(CASE WHEN is_option = 1 THEN 1 ELSE 0 END) as options
      FROM investments
    `).get() as { total: number; buys: number; sells: number; options: number };

    const accountSplit = this.db.prepare(`
      SELECT account, COUNT(*) as count FROM investments GROUP BY account
    `).all() as Array<{ account: string; count: number }>;

    return { monthlyActivity: monthlyRows, tickerFrequency: tickerRows, annotationProgress: annotation, totalStats: stats, accountSplit };
  }

  // ── Rejection Therapy ("The No") ─────────────────────────────────────────────
  // A standalone, permanent list — the goal is to collect 300 asks / rejections.
  // Kept in its OWN table (not `todos`) so the nightly midnight reset never
  // touches it.

  /** One example ask so the list isn't totally blank on first visit. Ashni fills in the rest (goal: 300). */
  private static REJECTION_SEED: string[] = [
    "Ask a stranger for a compliment.",
  ];

  private ensureRejectionSeed(): void {
    const flag = this.db.prepare(`SELECT value FROM kv_store WHERE key = 'rejection_seeded'`).get() as { value: string } | undefined;
    if (flag) return;

    const now = Date.now();
    const insert = this.db.prepare(`
      INSERT INTO rejection_challenges (title, done, outcome, order_position, created_at, updated_at)
      VALUES (?, 0, NULL, ?, ?, ?)
    `);
    const seed = this.db.transaction(() => {
      TodoDatabase.REJECTION_SEED.forEach((title, i) => {
        insert.run(title, i, now + i, now + i);
      });
      this.db.prepare(`INSERT OR REPLACE INTO kv_store (key, value, created_at) VALUES ('rejection_seeded', '1', ?)`).run(now);
    });
    seed();
  }

  private mapRejection(row: {
    id: number; title: string; done: number; outcome: string | null;
    order_position: number; created_at: number; updated_at: number; done_at: number | null;
  }): RejectionChallenge {
    return {
      id: row.id,
      title: row.title,
      done: row.done === 1,
      outcome: (row.outcome === 'no' || row.outcome === 'yes') ? row.outcome : null,
      order_position: row.order_position,
      created_at: row.created_at,
      updated_at: row.updated_at,
      done_at: row.done_at,
    };
  }

  /** Stable creation order — crossed-off asks stay exactly where they are in the list. */
  getRejectionChallenges(): RejectionChallenge[] {
    const rows = this.db.prepare(`
      SELECT id, title, done, outcome, order_position, created_at, updated_at, done_at
      FROM rejection_challenges
      ORDER BY order_position ASC, created_at ASC
    `).all() as any[];
    return rows.map(r => this.mapRejection(r));
  }

  addRejectionChallenge(title: string): RejectionChallenge {
    const now = Date.now();
    const maxRow = this.db.prepare('SELECT MAX(order_position) as m FROM rejection_challenges').get() as { m: number | null };
    const order = (maxRow.m ?? -1) + 1;
    const result = this.db.prepare(`
      INSERT INTO rejection_challenges (title, done, outcome, order_position, created_at, updated_at)
      VALUES (?, 0, NULL, ?, ?, ?)
    `).run(title, order, now, now);
    return {
      id: result.lastInsertRowid as number,
      title, done: false, outcome: null,
      order_position: order, created_at: now, updated_at: now, done_at: null,
    };
  }

  updateRejectionChallenge(
    id: number,
    updates: { title?: string; done?: boolean; outcome?: 'no' | 'yes' | null },
  ): RejectionChallenge {
    const current = this.db.prepare(`
      SELECT id, title, done, outcome, order_position, created_at, updated_at, done_at
      FROM rejection_challenges WHERE id = ?
    `).get(id) as any;
    if (!current) throw new Error(`Rejection challenge ${id} not found`);

    const now = Date.now();
    const newTitle = updates.title ?? current.title;
    const newDone = updates.done !== undefined ? (updates.done ? 1 : 0) : current.done;
    // Marking done stamps done_at; un-checking clears both done_at and outcome.
    const newDoneAt = newDone === 1 ? (current.done_at ?? now) : null;
    let newOutcome: string | null;
    if (updates.outcome !== undefined) newOutcome = updates.outcome;
    else newOutcome = newDone === 1 ? current.outcome : null;

    this.db.prepare(`
      UPDATE rejection_challenges
      SET title = ?, done = ?, outcome = ?, updated_at = ?, done_at = ?
      WHERE id = ?
    `).run(newTitle, newDone, newOutcome, now, newDoneAt, id);

    return this.mapRejection({ ...current, title: newTitle, done: newDone, outcome: newOutcome, updated_at: now, done_at: newDoneAt });
  }

  deleteRejectionChallenge(id: number): void {
    const result = this.db.prepare('DELETE FROM rejection_challenges WHERE id = ?').run(id);
    if (result.changes === 0) throw new Error(`Rejection challenge ${id} not found`);
  }

  // ── Shared world helpers ─────────────────────────────────────────────────────
  private isoToday(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private ensureWorldsSeed(): void {
    const flag = this.db.prepare(`SELECT value FROM kv_store WHERE key = 'worlds_seeded_v1'`).get() as { value: string } | undefined;
    if (flag) return;
    const now = Date.now();
    const seed = this.db.transaction(() => {
      const h = this.db.prepare(`INSERT INTO habit_cards (title, reward, goal, punch_count, rounds, color, order_position, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)`);
      h.run('Move your body', 'a fancy oat latte', 10, 3, 0, 0, now);
      h.run('Read before bed', 'a brand-new hardcover', 7, 1, 1, 1, now + 1);
      this.db.prepare(`INSERT OR REPLACE INTO kv_store (key, value, created_at) VALUES ('worlds_seeded_v1', '1', ?)`).run(now);
    });
    seed();
  }

  // ── The Punch Card (habits) ──────────────────────────────────────────────────
  getHabitCards(): HabitCard[] {
    const rows = this.db.prepare(`
      SELECT id, title, reward, goal, punch_count, rounds, last_punch_date, color, order_position, created_at
      FROM habit_cards ORDER BY order_position ASC, created_at ASC
    `).all() as any[];
    return rows.map(r => ({ ...r, last_punch_date: r.last_punch_date ?? null }));
  }

  addHabitCard(title: string, reward: string = '', goal: number = 10, color: number = 0): HabitCard {
    const now = Date.now();
    const max = this.db.prepare('SELECT MAX(order_position) as m FROM habit_cards').get() as { m: number | null };
    const order = (max.m ?? -1) + 1;
    const res = this.db.prepare(`
      INSERT INTO habit_cards (title, reward, goal, punch_count, rounds, color, order_position, created_at)
      VALUES (?, ?, ?, 0, 0, ?, ?, ?)
    `).run(title, reward, goal, color, order, now);
    return { id: res.lastInsertRowid as number, title, reward, goal, punch_count: 0, rounds: 0, last_punch_date: null, color, order_position: order, created_at: now };
  }

  /** Punch today's slot once. Returns the updated card + whether a card was just completed. */
  punchHabitCard(id: number): { card: HabitCard; justCompleted: boolean } {
    const card = this.db.prepare(`SELECT * FROM habit_cards WHERE id = ?`).get(id) as any;
    if (!card) throw new Error(`Habit card ${id} not found`);
    const today = this.isoToday();
    let justCompleted = false;
    if (card.last_punch_date !== today) {
      card.punch_count += 1;
      card.last_punch_date = today;
      if (card.punch_count >= card.goal) {
        card.rounds += 1;
        card.punch_count = 0;
        justCompleted = true;
      }
      this.db.prepare(`UPDATE habit_cards SET punch_count = ?, rounds = ?, last_punch_date = ? WHERE id = ?`)
        .run(card.punch_count, card.rounds, card.last_punch_date, id);
    }
    return { card: { ...card, last_punch_date: card.last_punch_date }, justCompleted };
  }

  updateHabitCard(id: number, updates: { title?: string; reward?: string; goal?: number }): HabitCard {
    const cur = this.db.prepare(`SELECT * FROM habit_cards WHERE id = ?`).get(id) as any;
    if (!cur) throw new Error(`Habit card ${id} not found`);
    const title = updates.title ?? cur.title;
    const reward = updates.reward ?? cur.reward;
    const goal = updates.goal ?? cur.goal;
    this.db.prepare(`UPDATE habit_cards SET title = ?, reward = ?, goal = ? WHERE id = ?`).run(title, reward, goal, id);
    return { ...cur, title, reward, goal };
  }

  deleteHabitCard(id: number): void {
    this.db.prepare(`DELETE FROM habit_cards WHERE id = ?`).run(id);
  }

  // ── Undercurrent (mood field: valence × arousal → color) ─────────────────────
  getForecastLogs(): ForecastLog[] {
    return this.db.prepare(`
      SELECT id, date, valence, arousal, color, note, created_at
      FROM forecast_logs ORDER BY date ASC
    `).all() as ForecastLog[];
  }

  upsertForecastLog(date: string, valence: number, arousal: number, color: string, note: string): ForecastLog {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO forecast_logs (date, valence, arousal, color, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET valence = excluded.valence, arousal = excluded.arousal, color = excluded.color, note = excluded.note
    `).run(date, valence, arousal, color, note, now);
    return this.db.prepare(`SELECT id, date, valence, arousal, color, note, created_at FROM forecast_logs WHERE date = ?`).get(date) as ForecastLog;
  }

  deleteForecastLog(date: string): void {
    this.db.prepare(`DELETE FROM forecast_logs WHERE date = ?`).run(date);
  }

  /**
   * Delete all todos
   */
  clearAllTodos(): void {
    this.db.exec("DELETE FROM todos");
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
