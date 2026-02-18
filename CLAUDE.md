# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**todo-receipts** is an NPM package that generates beautiful thermal printer-style receipts for to-do lists. Users manage their tasks through a web dashboard and can print them to actual thermal printers or save as beautiful HTML receipts.

## Development Commands

```bash
# Build TypeScript to JavaScript
npm run build

# Watch mode for development
npm run dev

# Test the CLI locally (after building)
node bin/todo-receipts.js serve
node bin/todo-receipts.js print
node bin/todo-receipts.js print --output html
node bin/todo-receipts.js config --show

# Install locally for testing as if installed globally
npm link
todo-receipts serve

# Prepare for publishing
npm run prepublishOnly  # Runs build automatically
```

## Architecture

### Data Flow

```
Dashboard (HTML/JS)
  ↓ (HTTP API calls)
TodoServer
  ↓
ApiRouter → TodoDatabase (SQLite)
  ↓
PrintCommand → ReceiptGenerator + HtmlRenderer + ThermalPrinter
  ↓
Output (Console/HTML/Printer)
```

### Key Components

**Server** (`src/server/`)
- `server.ts` - HTTP server using Node's built-in http module
- `routes.ts` - API router handling all endpoints

**Database** (`src/database/`)
- `database.ts` - SQLite database wrapper using better-sqlite3
- `schema.ts` - TodoItem interface and table schema

**Commands** (`src/commands/`)
- `serve.ts` - Start dashboard server
- `print.ts` - Print to-do list receipt
- `config.ts` - Manage configuration

**Core Logic** (`src/core/`)
- `receipt-generator.ts` - Creates ASCII text receipt (35 char width)
- `html-renderer.ts` - Generates standalone HTML with embedded CSS
- `thermal-printer.ts` - ESC/POS commands for thermal printing
- `config-manager.ts` - Handles `~/.todo-receipts/config.json` I/O

**Templates** (`src/templates/`)
- `dashboard.html` - Dashboard UI
- `dashboard.js` - Dashboard JavaScript (vanilla, no build step)

**Utils** (`src/utils/`)
- `formatting.ts` - Date/time formatting
- `ascii-art.ts` - Headers and separators for text receipts

### Critical Implementation Details

**Database (SQLite with better-sqlite3)**
- Synchronous API for simplicity
- WAL mode enabled for better concurrency
- Tables: todos (id, title, completed, created_at, updated_at)
- Auto-increment integer IDs

**API Endpoints**
- `GET /` - Serve dashboard HTML
- `GET /dashboard.js` - Serve dashboard JavaScript
- `GET /api/todos` - List all todos
- `POST /api/todos` - Create todo (body: {title})
- `PUT /api/todos/:id` - Update todo (body: {title?, completed?})
- `DELETE /api/todos/:id` - Delete todo
- `POST /api/print` - Generate and print receipt

**Receipt Format**
- 35 character width for thermal printers
- Header: "TO-DO LIST"
- Date/time
- Tasks with [ ] or [✓] checkboxes
- Summary (total/completed/pending counts)
- Footer: "Thank you for staying organized!"

**Thermal Printer Integration**
- Preserves ESC/POS protocol from claude-receipts
- Supports USB (auto-detect or specific VID:PID), TCP, and CUPS
- Uses EscPosBuilder class for command generation
- QR code points to github.com/chrishutchinson/todo-receipts

**HTML Receipts**
- Standalone HTML with embedded CSS
- Dark background (#3a3a3a) with light receipt (#f8f8f8)
- Thermal aesthetic with perforated edges
- Saved to `~/.todo-receipts/receipts/`

**Dashboard**
- Single-page app with vanilla JavaScript
- No build process
- Fetch API for HTTP requests
- Real-time updates after CRUD operations
- Enter key to add, Escape to cancel editing

## Type System

All types in `src/types/`:
- `todo.ts` - TodoItem and TodoListData interfaces
- `config.ts` - ReceiptConfig with printer and serverPort

## Package Structure

- **ESM only** (`"type": "module"`) - Node 22+ required
- **bin entry**: `bin/todo-receipts.js` imports from `dist/cli.js`
- **Exports**: Main exports from `src/index.ts` for programmatic use
- **Files distributed**: `dist/`, `bin/`, `templates/`

## Known Constraints

- better-sqlite3 requires native compilation
- Server uses Node's built-in http module (no Express)
- Dashboard served directly from `src/templates/`
- Printer code identical to claude-receipts (only content changed)

## Default Behavior

Running `todo-receipts` with no command defaults to `serve` command, starting the dashboard server.

## File Locations

- Config: `~/.todo-receipts/config.json`
- Database: `~/.todo-receipts/todos.db`
- Receipts: `~/.todo-receipts/receipts/`
