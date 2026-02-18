#!/usr/bin/env node

import { Command, Option } from "commander";
import { PrintCommand } from "./commands/print.js";
import { ServeCommand } from "./commands/serve.js";
import { ConfigCommand } from "./commands/config.js";

const program = new Command();

program
  .name("todo-receipts")
  .description("Print beautiful thermal receipt-style to-do lists")
  .version("2.0.0");

// Serve command
program
  .command("serve")
  .description("Start the to-do list dashboard server")
  .option("-p, --port <number>", "Port number (default: 3000)", "3000")
  .option("--no-browser", "Do not open browser automatically")
  .action(async (options) => {
    const command = new ServeCommand();
    await command.execute(options);
  });

// Print command
program
  .command("print")
  .description("Print a receipt of your to-do list")
  .addOption(
    new Option("-o, --output <format...>", "Output format(s): html, console, printer (comma-separated or repeated)")
      .argParser((value: string, prev: string[] | undefined) => {
        const formats = value.split(",").map((s) => s.trim()).filter(Boolean);
        const valid = ["html", "console", "printer"];
        for (const f of formats) {
          if (!valid.includes(f)) {
            throw new Error(`Invalid output format "${f}". Valid formats: ${valid.join(", ")}`);
          }
        }
        return [...(prev || []), ...formats];
      }),
  )
  .option(
    "-p, --printer <interface>",
    'Printer: "usb" (auto-detect), "usb:VID:PID", "tcp://host:port", or CUPS name',
  )
  .action(async (options) => {
    const command = new PrintCommand();
    await command.execute(options);
  });

// Config command
program
  .command("config")
  .description("Manage configuration")
  .option("--show", "Display current configuration")
  .option("--set <key=value>", "Set a configuration value")
  .option("--reset", "Reset configuration to defaults")
  .action(async (options) => {
    const command = new ConfigCommand();
    await command.execute(options);
  });

// Make serve the default command if no command is specified
if (process.argv.length === 2) {
  process.argv.push("serve");
}

program.parse();
