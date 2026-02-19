import type { TodoItem } from "../types/todo.js";
import type { ReceiptConfig } from "../types/config.js";

export interface ReceiptData {
  todos: TodoItem[];
  totalCount: number;
  completedCount: number;
  timestamp: Date;
  config: ReceiptConfig;
}

const SEPARATOR = "------------------------------";
const WIDTH = 30;

export class ReceiptGenerator {
  /**
   * Generate a complete receipt as text
   */
  generateReceipt(data: ReceiptData): string {
    const lines: string[] = [];

    // Get terminal number (days since 2024)
    const terminalNum = Math.floor(
      (data.timestamp.getTime() - new Date('2024-01-01').getTime()) / (1000 * 60 * 60 * 24)
    );

    // Format as 6-digit number
    const terminalId = String(terminalNum).padStart(6, '0');

    // Header - Store receipt style
    lines.push("");
    lines.push(this.centerText("ASHNI OPS TERMINAL", WIDTH));
    lines.push(this.centerText("123 Main Street", WIDTH));
    lines.push(this.centerText("New York, NY 10001", WIDTH));
    lines.push(this.centerText("Tel: (555) 123-4567", WIDTH));
    lines.push("");
    lines.push(`Terminal: Marlboro    #${terminalId}`);

    // Date and time
    const date = data.timestamp;
    const dateStr = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
    const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    lines.push(`Date: ${dateStr}    Time: ${timeStr}`);

    lines.push(SEPARATOR);

    // Column headers
    lines.push(this.padLine("ITEM", "SCHED", WIDTH));
    lines.push(SEPARATOR);

    // Items
    for (const todo of data.todos) {
      // 4 chars for "[ ] ", leaving 15 for title before truncation
      const itemName = this.truncate(todo.title.toUpperCase(), 15);
      const sched = todo.time_estimate || "TBD";
      lines.push(this.padLine(`[ ] ${itemName}`, sched, WIDTH));
    }

    lines.push(SEPARATOR);
    lines.push(this.padLine("ITEM COUNT", String(data.totalCount), WIDTH));
    lines.push(SEPARATOR);

    // Supplements section
    lines.push("SUPPLEMENTS TAKEN");
    lines.push("[ ] IRON 1        [ ] IRON 2");
    lines.push("[ ] VIT C         [ ] VIT D");
    lines.push(SEPARATOR);

    // Manual entries section
    lines.push("MANUAL ENTRIES");
    lines.push(SEPARATOR);
    lines.push("NOTES: _______________________");
    lines.push("UNEXPECTED: __________________");
    lines.push(SEPARATOR);
    lines.push("");
    lines.push(this.centerText("PROCESS COMPLETE", WIDTH));
    lines.push("");

    return lines.join("\n");
  }

  /**
   * Format a line with left and right alignment
   */
  private padLine(left: string, right: string, width: number = WIDTH): string {
    const totalLen = left.length + right.length;
    const spacesNeeded = Math.max(1, width - totalLen);
    return left + " ".repeat(spacesNeeded) + right;
  }

  /**
   * Center text in a given width
   */
  private centerText(text: string, width: number): string {
    const padding = Math.max(0, Math.floor((width - text.length) / 2));
    return " ".repeat(padding) + text;
  }

  /**
   * Truncate text to a maximum length
   */
  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 3) + "...";
  }
}
