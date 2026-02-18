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

  constructor() {
    this.configManager = new ConfigManager();
  }

  async start(port: number = 3000): Promise<void> {
    // Initialize database
    const dbPath = this.configManager.getDatabasePath();
    this.db = new TodoDatabase(dbPath);

    // Initialize router
    this.router = new ApiRouter(this.db, this.configManager);

    // Create HTTP server
    this.server = createServer((req, res) => {
      if (this.router) {
        this.router.handleRequest(req, res);
      }
    });

    // Start listening
    return new Promise((resolve, reject) => {
      this.server!.listen(port, () => {
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
