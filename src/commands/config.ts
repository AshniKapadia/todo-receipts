import chalk from "chalk";
import { ConfigManager } from "../core/config-manager.js";
import type { ReceiptConfig } from "../types/config.js";

export interface ConfigOptions {
  show?: boolean;
  set?: string;
  reset?: boolean;
}

export class ConfigCommand {
  private configManager = new ConfigManager();

  async execute(options: ConfigOptions): Promise<void> {
    try {
      // Show config
      if (options.show) {
        await this.showConfig();
        return;
      }

      // Reset config
      if (options.reset) {
        await this.resetConfig();
        return;
      }

      // Set config value
      if (options.set) {
        await this.setConfig(options.set);
        return;
      }

      // Default: show config
      await this.showConfig();
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      } else {
        console.error(chalk.red("An unknown error occurred"));
      }
      process.exit(1);
    }
  }

  /**
   * Display current configuration
   */
  private async showConfig(): Promise<void> {
    const config = await this.configManager.loadConfig();
    const configPath = this.configManager.getConfigPath();

    console.log(chalk.cyan.bold("\nTodo Receipts Configuration"));
    console.log(chalk.gray(`Location: ${configPath}\n`));

    this.printConfigItem("Version", config.version);
    this.printConfigItem("Server Port", String(config.serverPort || 3000));
    this.printConfigItem("Printer", config.printer || "(not set)");

    console.log("");
  }

  /**
   * Set a configuration value
   */
  private async setConfig(setValue: string): Promise<void> {
    const [key, ...valueParts] = setValue.split("=");
    const value = valueParts.join("=").trim();

    if (!key || !value) {
      throw new Error("Invalid format. Use: --set key=value");
    }

    const trimmedKey = key.trim() as keyof ReceiptConfig;

    // Validate key
    const validKeys: (keyof ReceiptConfig)[] = ["printer", "serverPort"];

    if (!validKeys.includes(trimmedKey)) {
      throw new Error(
        `Invalid config key: ${trimmedKey}. Valid keys: ${validKeys.join(", ")}`,
      );
    }

    // Convert serverPort to number if needed
    let finalValue: string | number = value;
    if (trimmedKey === "serverPort") {
      const port = parseInt(value, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error("Server port must be a number between 1 and 65535");
      }
      finalValue = port;
    }

    // Update config
    await this.configManager.updateConfig(trimmedKey, finalValue);

    console.log(chalk.green(`✓ Updated ${trimmedKey} = ${finalValue}`));
  }

  /**
   * Reset configuration to defaults
   */
  private async resetConfig(): Promise<void> {
    await this.configManager.resetConfig();
    console.log(chalk.green("✓ Configuration reset to defaults"));
  }

  /**
   * Print a config item
   */
  private printConfigItem(label: string, value: string): void {
    console.log(`  ${chalk.bold(label.padEnd(20))} ${value}`);
  }
}
