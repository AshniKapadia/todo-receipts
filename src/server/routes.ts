import type { IncomingMessage, ServerResponse } from "http";
import type { TodoDatabase } from "../database/database.js";
import type { ConfigManager } from "../core/config-manager.js";
import { ReceiptGenerator } from "../core/receipt-generator.js";
import { HtmlRenderer } from "../core/html-renderer.js";
import { ThermalPrinterRenderer } from "../core/thermal-printer.js";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { dirname, resolve, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || join(homedir(), '.todo-receipts');
const IMAGES_DIR = join(DATA_DIR, 'images');

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

      // Favicon
      if (pathname === "/favicon.svg" && method === "GET") {
        await this.serveFavicon(res);
        return;
      }

      // Custom font
      if (pathname === "/Ashni-Regular.ttf" && method === "GET") {
        await this.serveFont(res);
        return;
      }

      // Profiles route
      if (pathname === "/api/profiles" && method === "GET") {
        this.sendJson(res, { profiles: [{ id: 'ashni', name: 'Ashni' }, { id: 'nirav', name: 'Nirav' }] });
        return;
      }

      // Suggestions route (before /api/todos to avoid conflicts)
      if (pathname === "/api/suggestions" && method === "GET") {
        const category = parsedUrl.searchParams.get("category") || "General";
        const userId = parsedUrl.searchParams.get("user") || 'ashni';
        await this.getSuggestions(res, category, userId);
        return;
      }

      // API routes
      if (pathname === "/api/todos" && method === "GET") {
        const category = parsedUrl.searchParams.get("category") || undefined;
        const date = parsedUrl.searchParams.get("date") || undefined;
        const userId = parsedUrl.searchParams.get("user") || 'ashni';
        await this.getTodos(res, category, date, userId);
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

      // Period tracker routes
      if (pathname === "/api/period" && method === "GET") {
        const userId = parsedUrl.searchParams.get("user") || "ashni";
        const logs = this.db.getPeriodLogs(userId);
        this.sendJson(res, { logs });
        return;
      }

      if (pathname === "/api/period" && method === "POST") {
        await this.createPeriodLog(req, res);
        return;
      }

      if (pathname.startsWith("/api/period/") && method === "DELETE") {
        const date = pathname.slice("/api/period/".length);
        const userId = parsedUrl.searchParams.get("user") || "ashni";
        this.db.deletePeriodLog(userId, date);
        this.sendJson(res, { success: true });
        return;
      }

      if (pathname === "/api/print" && method === "POST") {
        await this.printReceipt(req, res);
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

      // Movie routes
      if (pathname === '/api/movies' && method === 'GET') {
        this.sendJson(res, { movies: this.db.getMovies() });
        return;
      }

      if (pathname === '/api/movies/search' && method === 'GET') {
        await this.searchMovies(res, parsedUrl.searchParams.get('q') || '');
        return;
      }

      if (pathname === '/api/movies' && method === 'POST') {
        await this.createMovie(req, res);
        return;
      }

      if (pathname.startsWith('/api/movies/') && method === 'DELETE') {
        const id = this.extractId(pathname);
        this.db.deleteMovie(id);
        this.sendJson(res, { success: true });
        return;
      }

      // Serve stored images
      if (pathname.startsWith('/api/images/') && method === 'GET') {
        await this.serveImage(res, pathname.slice('/api/images/'.length));
        return;
      }

      // Investment routes
      if (pathname === '/api/investments' && method === 'GET') {
        const account = parsedUrl.searchParams.get('account') || undefined;
        const transactions = this.db.getInvestments(account);
        this.sendJson(res, { transactions });
        return;
      }

      if (pathname === '/api/investments/clear' && method === 'DELETE') {
        const deleted = this.db.clearInvestments();
        this.sendJson(res, { deleted });
        return;
      }

      if (pathname === '/api/investments/import' && method === 'POST') {
        const body = await this.parseBody(req);
        if (!Array.isArray(body.transactions)) {
          this.sendError(res, 400, 'transactions array required');
          return;
        }
        const result = this.db.importInvestments(body.transactions);
        this.sendJson(res, result);
        return;
      }

      if (pathname === '/api/investments/patterns' && method === 'GET') {
        const patterns = this.db.getInvestmentPatterns();
        this.sendJson(res, patterns);
        return;
      }

      if (pathname.startsWith('/api/investments/') && method === 'PUT') {
        const id = this.extractId(pathname);
        const body = await this.parseBody(req);
        const updates: { reason?: string | null; future_goal?: string | null } = {};
        if (body.reason !== undefined) updates.reason = body.reason || null;
        if (body.future_goal !== undefined) updates.future_goal = body.future_goal || null;
        this.db.updateInvestment(id, updates);
        this.sendJson(res, { success: true });
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

  private async serveFavicon(res: ServerResponse): Promise<void> {
    try {
      const svgPath = resolve(__dirname, "../templates/favicon.svg");
      const svg = await readFile(svgPath, "utf-8");
      res.writeHead(200, { "Content-Type": "image/svg+xml" });
      res.end(svg);
    } catch (error) {
      this.sendError(res, 500, "Failed to load favicon");
    }
  }

  private async serveFont(res: ServerResponse): Promise<void> {
    try {
      const fontPath = resolve(__dirname, "../templates/Ashni-Regular.ttf");
      const font = await readFile(fontPath);
      res.writeHead(200, { "Content-Type": "font/ttf", "Cache-Control": "public, max-age=31536000" });
      res.end(font);
    } catch (error) {
      this.sendError(res, 500, "Failed to load font");
    }
  }

  private async getTodos(res: ServerResponse, category?: string, date?: string, userId?: string): Promise<void> {
    if (date) this.db.ensureRecurringTasks(date, userId);
    const todos = this.db.getAllTodos(category, date, userId);
    this.sendJson(res, { todos });
  }

  private async getSuggestions(res: ServerResponse, category: string, userId: string = 'ashni'): Promise<void> {
    const suggestions = this.db.getTaskSuggestions(category, userId);
    this.sendJson(res, { suggestions });
  }

  private async createTodo(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await this.parseBody(req);
    const { title, category, priority, time_estimate, scheduled_date, user } = body;

    if (!title || typeof title !== "string" || title.trim() === "") {
      this.sendError(res, 400, "Title is required");
      return;
    }

    const todo = this.db.createTodo(
      title.trim(),
      category || 'General',
      priority || 'medium',
      time_estimate || '',
      scheduled_date || undefined,
      user || 'ashni'
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

  private async createPeriodLog(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const { date, flow, symptoms, notes, user } = body;
    if (!date || typeof date !== "string") {
      this.sendError(res, 400, "date is required");
      return;
    }
    const log = this.db.upsertPeriodLog(
      user || "ashni",
      date,
      flow || null,
      Array.isArray(symptoms) ? symptoms : [],
      notes || ""
    );
    this.sendJson(res, { log });
  }

  private async printReceipt(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let userId = 'ashni';
    let date: string | undefined;
    let themeId = 'ops';
    let category: string | undefined;
    try {
      const body = await this.parseBody(req);
      if (body.user) userId = body.user;
      if (body.date) date = body.date;
      if (body.theme) themeId = body.theme;
      if (body.category) category = body.category;
    } catch { /* no body is fine */ }
    const todos = this.db.getAllTodos(category, date, userId);
    const jobId = this.db.createPrintJob(todos, themeId);
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

  private async searchMovies(res: ServerResponse, query: string): Promise<void> {
    if (!query.trim()) { this.sendJson(res, { results: [] }); return; }
    const token = process.env.TMDB_TOKEN;
    if (!token) { this.sendError(res, 503, 'TMDB_TOKEN not configured'); return; }
    const tmdbRes = await fetch(
      `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&include_adult=false`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await tmdbRes.json() as { results?: Array<{ title: string; poster_path: string; release_date: string }> };
    const results = (data.results || [])
      .filter(r => r.poster_path)
      .slice(0, 10)
      .map(r => ({
        title: r.title,
        posterUrl: `https://image.tmdb.org/t/p/w500${r.poster_path}`,
        year: r.release_date ? r.release_date.slice(0, 4) : '',
      }));
    this.sendJson(res, { results });
  }

  private async createMovie(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const { title, posterUrl, language } = body;
    if (!posterUrl) { this.sendError(res, 400, 'posterUrl required'); return; }
    const movie = this.db.addMovie(title || '', posterUrl, language || 'english');
    this.sendJson(res, { movie });
  }

  private async serveImage(res: ServerResponse, filename: string): Promise<void> {
    // Security: no path traversal
    if (!filename || filename.includes('/') || filename.includes('..')) {
      this.sendError(res, 400, 'Invalid filename');
      return;
    }
    try {
      const imagePath = join(IMAGES_DIR, filename);
      const data = await readFile(imagePath);
      const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
      const contentType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000' });
      res.end(data);
    } catch {
      this.sendError(res, 404, 'Image not found');
    }
  }
}
