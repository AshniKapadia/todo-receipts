export interface TodoItem {
  id: number;
  title: string;
  completed: boolean;
  category: string;
  priority: 'high' | 'medium' | 'low';
  time_estimate: string;
  order: number;
  created_at: number;
  updated_at: number;
  scheduled_date?: string;
  user_id: string;
}

export const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    category TEXT DEFAULT 'General',
    priority TEXT DEFAULT 'medium',
    time_estimate TEXT DEFAULT '',
    order_position INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    scheduled_date TEXT DEFAULT NULL,
    user_id TEXT NOT NULL DEFAULT 'ashni'
  );
  CREATE TABLE IF NOT EXISTS print_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT DEFAULT 'pending',
    todos_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );
`;
