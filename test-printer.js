#!/usr/bin/env node

import fs from 'fs';
import { execSync } from 'child_process';

console.log('🖨️  Testing Touch Dynamic LK-T210 Printer Connection\n');

// Test 1: Check for serial devices
console.log('1️⃣  Checking for serial devices...');
try {
  const devices = execSync('ls /dev/tty.* /dev/cu.* 2>/dev/null', { encoding: 'utf-8' });
  const deviceList = devices.trim().split('\n').filter(d => !d.includes('Bluetooth') && !d.includes('debug') && !d.includes('Bose'));

  if (deviceList.length > 0) {
    console.log('   Found potential devices:');
    deviceList.forEach(d => console.log(`   - ${d}`));
  } else {
    console.log('   No serial devices found');
  }
} catch (e) {
  console.log('   No serial devices found');
}

// Test 2: Check CUPS printers
console.log('\n2️⃣  Checking CUPS printers...');
try {
  const printers = execSync('lpstat -p 2>/dev/null', { encoding: 'utf-8' });
  if (printers.trim()) {
    console.log(printers);
  } else {
    console.log('   No CUPS printers configured');
  }
} catch (e) {
  console.log('   No CUPS printers configured');
}

// Test 3: Simple test print
console.log('\n3️⃣  Attempting test print to configured printer...');
console.log('   (This will try to print using the current configuration)\n');

try {
  execSync('cd /Users/ashnikapadia/claude-receipts && node bin/todo-receipts.js print --output console', {
    encoding: 'utf-8',
    stdio: 'inherit'
  });
} catch (e) {
  console.log('   Test print failed:', e.message);
}

console.log('\n📋 Next Steps:');
console.log('   1. Go to System Settings → Printers & Scanners');
console.log('   2. Click "Add Printer..." and look for Touch Dynamic LK-T210');
console.log('   3. Once added, get the printer name with: lpstat -p');
console.log('   4. Configure it with: node bin/todo-receipts.js config --set printer=PRINTER_NAME');
