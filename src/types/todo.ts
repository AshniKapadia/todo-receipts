import type { TodoItem } from "../database/schema.js";

export interface TodoListData {
  todos: TodoItem[];
  totalCount: number;
  completedCount: number;
  pendingCount: number;
  timestamp: Date;
}

export { TodoItem };
