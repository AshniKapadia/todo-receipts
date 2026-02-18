import chalk from "chalk";
import boxen from "boxen";
import ora from "ora";
import { exec } from "child_process";
import { promisify } from "util";
import { TodoDatabase } from "../database/database.js";
import { ReceiptGenerator } from "../core/receipt-generator.js";
import { HtmlRenderer } from "../core/html-renderer.js";
import { ThermalPrinterRenderer } from "../core/thermal-printer.js";
import { ConfigManager } from "../core/config-manager.js";

const execAsync = promisify(exec);

export type OutputFormat = "html" | "console" | "printer";

export interface PrintOptions {
  output?: string[];
  printer?: string;
}

export class PrintCommand {
  private receiptGenerator = new ReceiptGenerator();
  private htmlRenderer = new HtmlRenderer();
  private thermalPrinter = new ThermalPrinterRenderer();
  private configManager = new ConfigManager();

  async execute(options: PrintOptions): Promise<void> {
    const spinner = ora("Generating receipt...").start();

    try {
      // Load config
      const config = await this.configManager.loadConfig();

      // Load database
      const dbPath = this.configManager.getDatabasePath();
      const db = new TodoDatabase(dbPath);

      // Fetch todos
      spinner.text = "Loading tasks...";
      const todos = db.getAllTodos();

      // Generate receipt data
      spinner.text = "Generating receipt...";
      const receiptData = {
        todos,
        totalCount: todos.length,
        completedCount: todos.filter((t) => t.completed).length,
        timestamp: new Date(),
        config,
      };

      const receipt = this.receiptGenerator.generateReceipt(receiptData);

      spinner.succeed("Receipt generated!");

      // Determine output formats
      const outputFormats = [
        ...new Set(options.output || ["console"]),
      ] as OutputFormat[];

      const errors: Array<{ format: OutputFormat; error: Error }> = [];

      for (const format of outputFormats) {
        try {
          switch (format) {
            case "printer":
              await this.outputToPrinter(receiptData, options, config, spinner);
              break;
            case "html":
              await this.outputToHtml(receiptData, receipt);
              break;
            case "console":
              this.outputToConsole(receipt);
              break;
          }
        } catch (err) {
          const error =
            err instanceof Error ? err : new Error("Unknown error");
          errors.push({ format, error });

          if (outputFormats.length > 1) {
            console.log(
              chalk.yellow(`\n⚠ ${format} output failed: ${error.message}`),
            );
          }
        }
      }

      if (errors.length === outputFormats.length) {
        // All outputs failed
        throw errors[0].error;
      }

      // Close database
      db.close();
    } catch (error) {
      spinner.fail("Failed to generate receipt");

      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      } else {
        console.error(chalk.red("An unknown error occurred"));
      }

      process.exit(1);
    }
  }

  /**
   * Send receipt to thermal printer
   */
  private async outputToPrinter(
    receiptData: any,
    options: PrintOptions,
    config: { printer?: string },
    spinner: ReturnType<typeof ora>,
  ): Promise<void> {
    const printerInterface = options.printer || config.printer;
    if (!printerInterface) {
      throw new Error(
        'No printer specified. Use --printer <name> or set via: todo-receipts config --set printer=<name>',
      );
    }

    spinner.start("Sending to printer...");
    await this.thermalPrinter.printReceipt(receiptData, printerInterface);
    spinner.succeed(`Receipt sent to printer: ${printerInterface}`);
  }

  /**
   * Save receipt as HTML and optionally open in browser
   */
  private async outputToHtml(receiptData: any, receipt: string): Promise<void> {
    const timestamp = Date.now();
    const fileName = `todo-receipt-${timestamp}.html`;
    const receiptsDir = this.configManager.getReceiptsDir();
    const fullPath = `${receiptsDir}/${fileName}`;

    const html = this.htmlRenderer.generateHtml(receiptData, receipt);
    await this.saveHtmlFile(html, fullPath);

    // Open in browser
    await this.openInBrowser(fullPath);
  }

  /**
   * Display receipt to console with formatting
   */
  private outputToConsole(receipt: string): void {
    console.log(
      boxen(receipt, {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "cyan",
      }),
    );
  }

  /**
   * Save HTML file
   */
  private async saveHtmlFile(html: string, outputPath: string): Promise<void> {
    const { writeFile, mkdir } = await import("fs/promises");
    const { dirname, resolve } = await import("path");

    const resolvedPath = resolve(this.expandPath(outputPath));
    const dir = dirname(resolvedPath);

    // Ensure directory exists
    await mkdir(dir, { recursive: true });

    // Write HTML to file
    await writeFile(resolvedPath, html, "utf-8");

    console.log(chalk.green(`Receipt saved to: ${resolvedPath}`));
  }

  /**
   * Open file in default browser
   */
  private async openInBrowser(filePath: string): Promise<void> {
    const platform = process.platform;

    try {
      if (platform === "darwin") {
        // macOS
        await execAsync(`open "${filePath}"`);
      } else if (platform === "win32") {
        // Windows
        await execAsync(`start "" "${filePath}"`);
      } else {
        // Linux
        await execAsync(`xdg-open "${filePath}"`);
      }
    } catch (error) {
      // Silently fail - file is still saved
      console.log(chalk.cyan("Tip: Open the file manually to view in browser"));
    }
  }

  /**
   * Expand ~ to home directory
   */
  private expandPath(path: string): string {
    if (path.startsWith("~/")) {
      const home = process.env.HOME || process.env.USERPROFILE || "";
      return path.replace(/^~/, home);
    }
    return path;
  }
}
