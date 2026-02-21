import type { IncomingMessage, ServerResponse } from "http";
import type { TodoDatabase } from "../database/database.js";
import type { ConfigManager } from "../core/config-manager.js";
import { ReceiptGenerator } from "../core/receipt-generator.js";
import { HtmlRenderer } from "../core/html-renderer.js";
import { ThermalPrinterRenderer } from "../core/thermal-printer.js";
import { readFile } from "fs/promises";
import { writeFile, mkdir } from "fs/promises";
import { dirname, resolve, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

      // Suggestions route (before /api/todos to avoid conflicts)
      if (pathname === "/api/suggestions" && method === "GET") {
        const category = parsedUrl.searchParams.get("category") || "General";
        await this.getSuggestions(res, category);
        return;
      }

      // API routes
      if (pathname === "/api/todos" && method === "GET") {
        const category = parsedUrl.searchParams.get("category") || undefined;
        const date = parsedUrl.searchParams.get("date") || undefined;
        await this.getTodos(res, category, date);
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

      if (pathname === "/api/print" && method === "POST") {
        await this.printReceipt(res);
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

  private async getTodos(res: ServerResponse, category?: string, date?: string): Promise<void> {
    const todos = this.db.getAllTodos(category, date);
    this.sendJson(res, { todos });
  }

  private async getSuggestions(res: ServerResponse, category: string): Promise<void> {
    const suggestions = this.db.getTaskSuggestions(category);
    this.sendJson(res, { suggestions });
  }

  private async createTodo(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await this.parseBody(req);
    const { title, category, priority, time_estimate, scheduled_date } = body;

    if (!title || typeof title !== "string" || title.trim() === "") {
      this.sendError(res, 400, "Title is required");
      return;
    }

    const todo = this.db.createTodo(
      title.trim(),
      category || 'General',
      priority || 'medium',
      time_estimate || '',
      scheduled_date || undefined
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

  private async printReceipt(res: ServerResponse): Promise<void> {
    const todos = this.db.getAllTodos();
    const jobId = this.db.createPrintJob(todos);
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
}
