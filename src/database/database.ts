import Database from "better-sqlite3";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { dirname } from "path";
import type { TodoItem } from "./schema.js";
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
  }

  /**
   * Get all todos, optionally filtered by category and/or scheduled_date
   */
  getAllTodos(category?: string, date?: string): TodoItem[] {
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const stmt = this.db.prepare(`
      SELECT id, title, completed, category, priority, time_estimate, order_position, created_at, updated_at, scheduled_date
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
    scheduled_date?: string
  ): TodoItem {
    const now = Date.now();

    // Get the current max order
    const maxOrderStmt = this.db.prepare("SELECT MAX(order_position) as max_order FROM todos");
    const maxOrderRow = maxOrderStmt.get() as { max_order: number | null };
    const newOrder = (maxOrderRow.max_order ?? -1) + 1;

    const stmt = this.db.prepare(`
      INSERT INTO todos (title, completed, category, priority, time_estimate, order_position, created_at, updated_at, scheduled_date)
      VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(title, category, priority, time_estimate, newOrder, now, now, scheduled_date ?? null);

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
   * Get top suggested task titles for a given category
   */
  getTaskSuggestions(category: string): string[] {
    const stmt = this.db.prepare(`
      SELECT title, COUNT(*) as cnt
      FROM todos
      WHERE category = ?
      GROUP BY title
      ORDER BY cnt DESC
      LIMIT 10
    `);
    const rows = stmt.all(category) as Array<{ title: string; cnt: number }>;
    return rows.map(r => r.title);
  }

  /**
   * Get a todo by ID (private helper)
   */
  private getTodoById(id: number): TodoItem | null {
    const stmt = this.db.prepare(`
      SELECT id, title, completed, category, priority, time_estimate, order_position, created_at, updated_at, scheduled_date
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
    };
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
