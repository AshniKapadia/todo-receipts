#!/usr/bin/env node
// poll-and-print.js — runs on your Mac, polls the cloud for print jobs and fires the thermal printer

import { ThermalPrinterRenderer } from './dist/core/thermal-printer.js';
import { ConfigManager } from './dist/core/config-manager.js';

const CLOUD_URL = process.env.CLOUD_URL || 'https://todo-receipts-production.up.railway.app';
const POLL_INTERVAL = 5000;

const printer = new ThermalPrinterRenderer();
const configManager = new ConfigManager();

async function poll() {
  try {
    const res = await fetch(`${CLOUD_URL}/api/print/pending`);
    if (!res.ok) return;

    const { jobs } = await res.json();
    if (!jobs.length) return;

    const config = await configManager.loadConfig();
    if (!config.printer) {
      console.error('No printer configured. Run: node bin/todo-receipts.js config --set printer=usb:0525:a700');
      return;
    }

    for (const job of jobs) {
      try {
        const receiptData = {
          todos: job.todos,
          totalCount: job.todos.length,
          completedCount: job.todos.filter((t) => t.completed).length,
          timestamp: new Date(job.created_at),
          config,
        };

        await printer.printReceipt(receiptData, config.printer);
        console.log(`[${new Date().toLocaleTimeString()}] Printed job #${job.id}`);

        await fetch(`${CLOUD_URL}/api/print/${job.id}/complete`, { method: 'POST' });
      } catch (err) {
        console.error(`Failed to print job #${job.id}:`, err.message);
      }
    }
  } catch {
    // Network error — silently retry next interval
  }
}

console.log(`Polling ${CLOUD_URL} every ${POLL_INTERVAL / 1000}s for print jobs...`);
console.log('Press Ctrl+C to stop\n');
poll();
setInterval(poll, POLL_INTERVAL);
