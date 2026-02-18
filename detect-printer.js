#!/usr/bin/env node

import usb from 'usb';
import { execSync } from 'child_process';

console.log('🔍 Searching for thermal printers...\n');

// Check USB devices
console.log('═══ USB Devices ═══');
const devices = usb.getDeviceList();
if (devices.length === 0) {
  console.log('  No USB devices found');
} else {
  devices.forEach((device, i) => {
    const desc = device.deviceDescriptor;
    const vid = desc.idVendor.toString(16).padStart(4, '0');
    const pid = desc.idProduct.toString(16).padStart(4, '0');

    try {
      device.open();
      const manufacturer = device.getStringDescriptor(desc.iManufacturer) || 'Unknown';
      const product = device.getStringDescriptor(desc.iProduct) || 'Unknown';
      device.close();

      console.log(`  [${i + 1}] ${manufacturer} - ${product}`);
      console.log(`      VID:PID = ${vid}:${pid}`);
      console.log(`      To use: todo-receipts config --set printer=usb:${vid}:${pid}\n`);
    } catch (e) {
      console.log(`  [${i + 1}] Device ${vid}:${pid} (unable to read details)`);
      console.log(`      To use: todo-receipts config --set printer=usb:${vid}:${pid}\n`);
    }
  });
}

// Check CUPS printers (macOS/Linux)
console.log('\n═══ CUPS Printers ═══');
try {
  const output = execSync('lpstat -p 2>/dev/null', { encoding: 'utf-8' });
  if (output.trim()) {
    const printers = output.trim().split('\n');
    printers.forEach((line, i) => {
      const match = line.match(/printer (\S+)/);
      if (match) {
        const name = match[1];
        console.log(`  [${i + 1}] ${name}`);
        console.log(`      To use: todo-receipts config --set printer=${name}\n`);
      }
    });
  } else {
    console.log('  No CUPS printers configured');
  }
} catch (e) {
  console.log('  CUPS not available or no printers found');
}

// Check system profiler for more details (macOS only)
console.log('\n═══ System Profiler (macOS) ═══');
try {
  const output = execSync('system_profiler SPPrintersDataType 2>/dev/null', { encoding: 'utf-8' });
  if (output.includes('Printers:')) {
    console.log('  Found printers in System Preferences:');
    // Extract printer names
    const lines = output.split('\n');
    lines.forEach(line => {
      if (line.includes('Name:')) {
        console.log(`  ${line.trim()}`);
      }
    });
  } else {
    console.log('  No printers in System Preferences');
  }
} catch (e) {
  console.log('  Not macOS or unable to check System Preferences');
}

console.log('\n═══ Manual Configuration Options ═══');
console.log('  USB auto-detect:');
console.log('    todo-receipts config --set printer=usb\n');
console.log('  Network printer (replace IP):');
console.log('    todo-receipts config --set printer=tcp://192.168.1.100:9100\n');
console.log('  Specific USB device:');
console.log('    todo-receipts config --set printer=usb:04b8:0202\n');
console.log('  CUPS printer by name:');
console.log('    todo-receipts config --set printer=YOUR_PRINTER_NAME\n');
