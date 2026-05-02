export interface MovieItem {
  id: number;
  title: string;
  poster_url: string;
  language: string;
  created_at: number;
}

export interface WishlistItem {
  id: number;
  user_id: string;
  list_type: 'make' | 'buy';
  title: string;
  source_url: string;
  image_filename: string;
  rotation: number;
  pos_x: number;
  pos_y: number;
  z_index: number;
  created_at: number;
}

export interface PeriodLog {
  id: number;
  user_id: string;
  date: string;
  flow: string | null;
  symptoms: string[];
  notes: string;
  created_at: number;
}

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

export interface Investment {
  id: number;
  account: string;
  run_date: string;
  action_type: 'BUY' | 'SELL' | 'OPTIONS_BUY' | 'OPTIONS_SELL' | 'EXPIRED';
  symbol: string;
  description: string;
  price: number | null;
  quantity: number | null;
  amount: number | null;
  is_option: boolean;
  option_type: 'CALL' | 'PUT' | null;
  option_action: 'OPENING' | 'CLOSING' | 'EXPIRED' | null;
  reason: string | null;
  future_goal: string | null;
  raw_action: string;
  fidelity_key: string;
  created_at: number;
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
  CREATE TABLE IF NOT EXISTS period_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'ashni',
    date TEXT NOT NULL,
    flow TEXT DEFAULT NULL,
    symptoms TEXT DEFAULT '[]',
    notes TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    UNIQUE(user_id, date)
  );
  CREATE TABLE IF NOT EXISTS print_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT DEFAULT 'pending',
    todos_json TEXT NOT NULL,
    theme_id TEXT DEFAULT 'ops',
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS wishlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'ashni',
    list_type TEXT NOT NULL DEFAULT 'make',
    title TEXT DEFAULT '',
    source_url TEXT DEFAULT '',
    image_filename TEXT DEFAULT '',
    rotation REAL DEFAULT 0,
    pos_x REAL DEFAULT 20,
    pos_y REAL DEFAULT 20,
    z_index INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS movie_posters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT DEFAULT '',
    poster_url TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'english',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account TEXT NOT NULL,
    run_date TEXT NOT NULL,
    action_type TEXT NOT NULL,
    symbol TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price REAL,
    quantity REAL,
    amount REAL,
    is_option INTEGER DEFAULT 0,
    option_type TEXT DEFAULT NULL,
    option_action TEXT DEFAULT NULL,
    reason TEXT DEFAULT NULL,
    future_goal TEXT DEFAULT NULL,
    raw_action TEXT NOT NULL DEFAULT '',
    fidelity_key TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL
  );
`;
