import { createServer } from "http";
import type { Server } from "http";
import { TodoDatabase } from "../database/database.js";
import { ConfigManager } from "../core/config-manager.js";
import { ApiRouter } from "./routes.js";

export class TodoServer {
  private server: Server | null = null;
  private db: TodoDatabase | null = null;
  private configManager: ConfigManager;
  private router: ApiRouter | null = null;
  private midnightTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.configManager = new ConfigManager();
  }

  private scheduleMidnightClear(): void {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    this.midnightTimer = setTimeout(() => {
      if (this.db) {
        this.db.clearAllTodos();
        console.log(`[${new Date().toISOString()}] Daily reset: all todos cleared`);
      }
      this.scheduleMidnightClear();
    }, msUntilMidnight);
  }

  async start(port: number = 3000): Promise<void> {
    // Initialize database
    const dbPath = this.configManager.getDatabasePath();
    this.db = new TodoDatabase(dbPath);

    // Initialize router
    this.router = new ApiRouter(this.db, this.configManager);

    // Schedule daily midnight reset
    this.scheduleMidnightClear();

    // Create HTTP server
    this.server = createServer((req, res) => {
      if (this.router) {
        this.router.handleRequest(req, res);
      }
    });

    // Start listening
    return new Promise((resolve, reject) => {
      this.server!.listen(port, '0.0.0.0', () => {
        console.log(`\nTodo receipts server running at http://localhost:${port}`);
        console.log('Press Ctrl+C to stop\n');
        resolve();
      });

      this.server!.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          reject(
            new Error(
              `Port ${port} is already in use. Try a different port with --port`,
            ),
          );
        } else {
          reject(error);
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
    }

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log("\nServer stopped");
          resolve();
        });
      } else {
        resolve();
      }

      if (this.db) {
        this.db.close();
      }
    });
  }
}
