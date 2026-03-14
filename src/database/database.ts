import Database from "better-sqlite3";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { dirname } from "path";
import type { TodoItem, PeriodLog } from "./schema.js";
import { CREATE_TABLE_SQL } from "./schema.js";

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
  }

  /**
   * Get all todos, optionally filtered by category, scheduled_date, and/or user_id
   */
  getAllTodos(category?: string, date?: string, userId?: string): TodoItem[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (category) {
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
    { title: 'Tickets',       time_estimate: '6h',  days: [0,1,2,3,4,5,6] }, // Every day
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
  createPrintJob(todos: TodoItem[]): number {
    const stmt = this.db.prepare(
      "INSERT INTO print_jobs (status, todos_json, created_at) VALUES ('pending', ?, ?)"
    );
    const result = stmt.run(JSON.stringify(todos), Date.now());
    return result.lastInsertRowid as number;
  }

  /**
   * Get all pending print jobs
   */
  getPendingJobs(): Array<{ id: number; todos: TodoItem[]; created_at: number }> {
    const stmt = this.db.prepare(
      "SELECT id, todos_json, created_at FROM print_jobs WHERE status = 'pending' ORDER BY created_at ASC"
    );
    const rows = stmt.all() as Array<{ id: number; todos_json: string; created_at: number }>;
    return rows.map((row) => ({
      id: row.id,
      todos: JSON.parse(row.todos_json),
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
