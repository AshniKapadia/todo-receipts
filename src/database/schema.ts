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
    updated_at INTEGER NOT NULL
  )
`;
