import chalk from "chalk";
import { exec } from "child_process";
import { promisify } from "util";
import { TodoServer } from "../server/server.js";

const execAsync = promisify(exec);

export interface ServeOptions {
  port?: string;
  browser?: boolean;
}

export class ServeCommand {
  private server: TodoServer | null = null;

  async execute(options: ServeOptions): Promise<void> {
    const port = parseInt(options.port || process.env.PORT || "3000", 10);

    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(chalk.red("Error: Invalid port number"));
      process.exit(1);
    }

    try {
      // Create and start server
      this.server = new TodoServer();
      await this.server.start(port);

      // Open browser unless disabled
      if (options.browser !== false) {
        await this.openBrowser(`http://localhost:${port}`);
      }

      // Handle graceful shutdown
      process.on("SIGINT", async () => {
        console.log("\n\nShutting down...");
        if (this.server) {
          await this.server.stop();
        }
        process.exit(0);
      });

      process.on("SIGTERM", async () => {
        console.log("\n\nShutting down...");
        if (this.server) {
          await this.server.stop();
        }
        process.exit(0);
      });

      // Keep process alive
      await new Promise(() => {});
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      } else {
        console.error(chalk.red("Failed to start server"));
      }
      process.exit(1);
    }
  }

  /**
   * Open URL in default browser
   */
  private async openBrowser(url: string): Promise<void> {
    const platform = process.platform;

    try {
      if (platform === "darwin") {
        // macOS
        await execAsync(`open "${url}"`);
      } else if (platform === "win32") {
        // Windows
        await execAsync(`start "" "${url}"`);
      } else {
        // Linux
        await execAsync(`xdg-open "${url}"`);
      }
    } catch (error) {
      // Silently fail
      console.log(chalk.cyan(`\nOpen ${url} in your browser to access the dashboard`));
    }
  }
}
