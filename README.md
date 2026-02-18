# To-Do Receipts

Generate thermal printer-style receipts for your daily tasks.

## Installation

```bash
npm install -g todo-receipts
```

## Usage

Start the dashboard:

```bash
todo-receipts serve
```

Print a receipt:

```bash
todo-receipts print
```

View configuration:

```bash
todo-receipts config --show
```

## Commands

### serve
Start the web dashboard on port 3000 (default).

Options:
- `-p, --port <number>` - Specify port number
- `--no-browser` - Don't open browser automatically

### print
Generate a receipt from your current tasks.

Options:
- `-o, --output <format>` - Output format: html, console, or printer (default: console)
- `-p, --printer <interface>` - Printer interface for thermal printing

### config
Manage application configuration.

Options:
- `--show` - Display current configuration
- `--set <key=value>` - Set a configuration value
- `--reset` - Reset to defaults

## Printer Setup

### USB Printer
```bash
todo-receipts config --set printer=usb
```

### Network Printer
```bash
todo-receipts config --set printer=tcp://192.168.1.100:9100
```

### CUPS Printer
```bash
todo-receipts config --set printer=PRINTER_NAME
```

## File Locations

- Database: `~/.todo-receipts/todos.db`
- Config: `~/.todo-receipts/config.json`
- Receipts: `~/.todo-receipts/receipts/`

## Development

```bash
npm install
npm run build
node bin/todo-receipts.js serve
```

## License

MIT
