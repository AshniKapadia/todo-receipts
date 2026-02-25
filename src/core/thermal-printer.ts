import { createConnection } from "net";
import { exec } from "child_process";
import { promisify } from "util";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";
import type { ReceiptData } from "./receipt-generator.js";

const execAsync = promisify(exec);

const WIDTH = 40; // 80mm paper, Font A minus margin
const LEFT_MARGIN_DOTS = 12; // 1 character width at 203 dpi
const LOGO_WIDTH_DOTS = 200; // target logo width in printer dots
const LOGO_PATH = join(homedir(), ".todo-receipts", "logo.png");

// Epson USB vendor ID
const EPSON_VENDOR_ID = 0x04b8;
// TM-T88V product ID
const TM_T88V_PRODUCT_ID = 0x0202;

// ESC/POS command constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// CP437 block characters (raw byte values — not UTF-8)
const BLK = 0xdb; // █ full block
const UPH = 0xdf; // ▀ upper half block
const LFH = 0xdd; // ▌ left half block
const RHF = 0xde; // ▐ right half block

/** Tiny buffer builder for ESC/POS byte sequences. */
class EscPosBuilder {
  private chunks: Buffer[] = [];

  /** Append raw bytes. */
  raw(...bytes: number[]): this {
    this.chunks.push(Buffer.from(bytes));
    return this;
  }

  /** Append a UTF-8 string (no newline). */
  text(s: string): this {
    this.chunks.push(Buffer.from(s, "utf-8"));
    return this;
  }

  /** Append a string followed by LF. */
  line(s: string = ""): this {
    return this.text(s).raw(LF);
  }

  /** ESC @ — initialize printer. */
  init(): this {
    return this.raw(ESC, 0x40);
  }

  /** GS L nL nH — set left margin in motion units (1/203 inch). */
  leftMargin(dots: number): this {
    return this.raw(GS, 0x4c, dots & 0xff, (dots >> 8) & 0xff);
  }

  /**
   * Print the header text
   */
  logo(): this {
    this.align("center");
    this.doubleSize();
    this.line("TO-DO LIST");
    this.normalSize();
    return this;
  }

  /** ESC E n — bold on/off. */
  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  /** ESC a n — alignment (0=left, 1=center, 2=right). */
  align(mode: "left" | "center" | "right"): this {
    const n = mode === "left" ? 0 : mode === "center" ? 1 : 2;
    return this.raw(ESC, 0x61, n);
  }

  /**
   * ESC ! n — select print mode.
   *   bit 3 = double height, bit 4 = double width, bit 5 = bold
   *   0x00 = normal, 0x30 = double-height + double-width
   */
  printMode(n: number): this {
    return this.raw(ESC, 0x21, n);
  }

  /** Convenience: double-height + double-width text. */
  doubleSize(): this {
    return this.printMode(0x30);
  }

  /** Convenience: reset to normal size. */
  normalSize(): this {
    return this.printMode(0x00);
  }

  /** Print a full line of a repeated character. */
  drawLine(char: string = "="): this {
    return this.line(char.repeat(WIDTH));
  }

  /** Print a two-column row: left-aligned label, right-aligned value. */
  leftRight(left: string, right: string): this {
    const gap = WIDTH - left.length - right.length;
    if (gap < 1) {
      return this.line(`${left} ${right}`);
    }
    return this.line(`${left}${" ".repeat(gap)}${right}`);
  }

  /**
   * QR code via GS ( k commands (Epson model 2).
   *   1) Select model 2
   *   2) Set cell size
   *   3) Set error correction (M)
   *   4) Store data
   *   5) Print stored data
   */
  qrCode(data: string, cellSize: number = 6): this {
    const d = Buffer.from(data, "utf-8");

    // Function 165 — select QR model 2
    this.raw(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 50, 0);
    // Function 167 — set cell size
    this.raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, cellSize);
    // Function 169 — error correction level M (49)
    this.raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 49);
    // Function 180 — store data
    const storeLen = d.length + 3;
    this.raw(
      GS,
      0x28,
      0x6b,
      storeLen & 0xff,
      (storeLen >> 8) & 0xff,
      0x31,
      0x50,
      0x30,
    );
    this.chunks.push(d);
    // Function 181 — print
    this.raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30);

    return this;
  }

  /**
   * GS v 0 — print raster image.
   * data: 1-bit bitmap, MSB-first, row-major. 1 = black dot.
   */
  rasterImage(data: Buffer, widthDots: number, heightDots: number): this {
    const bytesPerLine = Math.ceil(widthDots / 8);
    this.raw(
      GS, 0x76, 0x30, 0x00,
      bytesPerLine & 0xff, (bytesPerLine >> 8) & 0xff,
      heightDots & 0xff, (heightDots >> 8) & 0xff,
    );
    this.chunks.push(data);
    return this;
  }

  /** GS V 66 3 — partial cut with feed. */
  partialCut(): this {
    return this.raw(GS, 0x56, 0x42, 3);
  }

  /** Return the complete buffer. */
  build(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

export class ThermalPrinterRenderer {
  /**
   * Print a receipt to a thermal printer.
   *
   * Supported interface formats:
   *   - "tcp://host:port" — send via TCP socket
   *   - "usb" — auto-detect Epson TM-T88V via libusb
   *   - "usb:VID:PID" — specific USB vendor/product ID (hex)
   *   - anything else — treated as a CUPS printer name
   */
  async printReceipt(
    data: ReceiptData,
    printerInterface: string,
    shareUrl?: string,
  ): Promise<void> {
    const buffer = await this.buildReceipt(data);

    if (printerInterface.startsWith("tcp://")) {
      await this.sendViaTcp(buffer, printerInterface);
    } else if (
      printerInterface === "usb" ||
      printerInterface.startsWith("usb:")
    ) {
      await this.sendViaUsb(buffer, printerInterface);
    } else {
      await this.sendViaCups(buffer, printerInterface);
    }
  }

  /**
   * Load, resize, and convert the logo PNG to a 1-bit ESC/POS raster bitmap.
   * Returns null if the logo file doesn't exist.
   */
  private async loadLogo(): Promise<{ data: Buffer; width: number; height: number } | null> {
    if (!existsSync(LOGO_PATH)) return null;

    const { Jimp } = await import("jimp");
    const img = await Jimp.read(LOGO_PATH);

    // Resize to target width, keep aspect ratio
    img.resize({ w: LOGO_WIDTH_DOTS });

    const width = img.width;
    const height = img.height;
    const bytesPerLine = Math.ceil(width / 8);
    const bitmap = Buffer.alloc(bytesPerLine * height, 0);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const hex = img.getPixelColor(x, y);
        const r = (hex >>> 24) & 0xff;
        const g = (hex >>> 16) & 0xff;
        const b = (hex >>> 8) & 0xff;
        const a = hex & 0xff;
        // Treat transparent pixels as white (no dot)
        if (a < 128) continue;
        // Dark pixel = print dot
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        if (luminance < 128) {
          const byteIdx = y * bytesPerLine + Math.floor(x / 8);
          bitmap[byteIdx] |= 1 << (7 - (x % 8));
        }
      }
    }

    return { data: bitmap, width, height };
  }

  /**
   * Build the full ESC/POS receipt buffer.
   */
  private async buildReceipt(data: ReceiptData): Promise<Buffer> {
    const b = new EscPosBuilder();

    b.init();
    b.leftMargin(LEFT_MARGIN_DOTS);

    // Terminal number (days since 2024-01-01)
    const terminalNum = Math.floor(
      (data.timestamp.getTime() - new Date("2024-01-01").getTime()) /
        (1000 * 60 * 60 * 24),
    );
    const terminalId = String(terminalNum).padStart(6, "0");

    // Date/time formatting
    const date = data.timestamp;
    const dateStr = `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${String(date.getFullYear()).slice(-2)}`;
    const timeStr = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

    // --- Header: logo + separator + name ---
    const logo = await this.loadLogo();
    if (logo) {
      b.align("center");
      b.rasterImage(logo.data, logo.width, logo.height);
    }
    b.align("center");
    b.drawLine("=");
    b.bold(true);
    b.line("ASHNI OPS TERMINAL");
    b.bold(false);
    b.line();

    // --- Terminal info ---
    b.align("left");
    b.line(`Terminal: Marlboro    #${terminalId}`);
    b.line(`Date: ${dateStr}    Time: ${timeStr}`);
    b.drawLine("-");

    // --- Column headers ---
    b.leftRight("ITEM", "SCHED");
    b.drawLine("-");

    // --- Items ---
    if (data.todos.length === 0) {
      b.align("center");
      b.line("No tasks!");
      b.align("left");
    } else {
      for (const todo of data.todos) {
        const upper = todo.title.toUpperCase();
        // 4 chars for "[ ] ", leaving 24 for title before truncation
        const itemName =
          upper.length > 24 ? upper.slice(0, 21) + "..." : upper;
        const sched = todo.time_estimate || "TBD";
        b.leftRight(`[ ] ${itemName}`, sched);
      }
    }

    b.drawLine("-");
    b.leftRight("ITEM COUNT", String(data.todos.length));
    b.drawLine("-");

    // --- Supplements ---
    b.line("SUPPLEMENTS TAKEN");
    b.line("[ ] IRON 1    [ ] IRON 2    [ ] VIT C");
    b.line("[ ] VIT D     [ ] WATER 1   [ ] WATER 2");
    b.line("[ ] SEEDS     [ ] HAIR MASS [ ] CARDIO");
    b.drawLine("-");

    // --- Manual entries ---
    b.line("MANUAL ENTRIES");
    b.drawLine("-");
    b.line("NOTES: " + "_".repeat(WIDTH - 7));
    b.line("UNEXPECTED: " + "_".repeat(WIDTH - 12));
    b.drawLine("-");
    b.line();

    // --- Footer ---
    b.align("center");
    b.line("PROCESS COMPLETE");
    b.line();

    // --- Cut ---
    b.partialCut();

    return b.build();
  }

  /**
   * Send buffer to a network printer via TCP.
   */
  private sendViaTcp(buffer: Buffer, address: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(address);
      const host = url.hostname;
      const port = parseInt(url.port || "9100", 10);

      const socket = createConnection({ host, port }, () => {
        socket.end(buffer, () => {
          resolve();
        });
      });

      socket.on("error", (err) => {
        reject(new Error(`TCP printer connection failed: ${err.message}`));
      });
    });
  }

  /**
   * Send buffer directly to a USB printer via libusb.
   *
   * @param buffer ESC/POS data
   * @param spec "usb" for auto-detect, or "usb:VID:PID" for specific device
   */
  private async sendViaUsb(buffer: Buffer, spec: string): Promise<void> {
    // @ts-ignore — usb is an optional native dep (not available in cloud builds)
    const { findByIds, getDeviceList, OutEndpoint } = await import("usb");

    let vid = EPSON_VENDOR_ID;
    let pid = TM_T88V_PRODUCT_ID;

    // Parse "usb:VID:PID" if provided
    if (spec.startsWith("usb:")) {
      const parts = spec.split(":");
      if (parts.length >= 3) {
        vid = parseInt(parts[1], 16);
        pid = parseInt(parts[2], 16);
      }
    }

    const device = findByIds(vid, pid);
    if (!device) {
      // List what USB devices we can see to help debug
      const devices = getDeviceList();
      const summary = devices
        .slice(0, 10)
        .map(
          (d: any) =>
            `  ${d.deviceDescriptor.idVendor.toString(16)}:${d.deviceDescriptor.idProduct.toString(16)}`,
        )
        .join("\n");

      throw new Error(
        `USB printer not found (looking for ${vid.toString(16)}:${pid.toString(16)}).\n` +
          `Visible USB devices:\n${summary || "  (none)"}`,
      );
    }

    device.open();

    try {
      const iface = device.interface(0);

      // Detach kernel driver if active (e.g. macOS claiming the device)
      if (iface.isKernelDriverActive()) {
        iface.detachKernelDriver();
      }

      iface.claim();

      // Find the OUT endpoint (bulk transfer to printer)
      const outEndpoint = iface.endpoints.find(
        (ep: any): ep is any =>
          ep instanceof OutEndpoint,
      );

      if (!outEndpoint) {
        throw new Error(
          "No OUT endpoint found on USB interface 0. " +
            `Endpoints: ${iface.endpoints.map((e: any) => `${e.address} (${e.direction})`).join(", ")}`,
        );
      }

      // Send the data
      await outEndpoint.transferAsync(buffer);

      await iface.releaseAsync();
    } finally {
      device.close();
    }
  }

  /**
   * Send raw ESC/POS buffer to a CUPS printer via `lp`.
   */
  private async sendViaCups(
    buffer: Buffer,
    printerName: string,
  ): Promise<void> {
    // Verify the CUPS destination exists before attempting to print.
    // `lp` gives a misleading "No such file or directory" when the
    // printer name doesn't match any CUPS destination.
    try {
      await execAsync(`lpstat -p "${printerName}"`);
    } catch {
      let available = "";
      try {
        const { stdout } = await execAsync("lpstat -p");
        const names = stdout
          .split("\n")
          .filter((l) => l.startsWith("printer "))
          .map((l) => l.split(" ")[1]);
        if (names.length > 0) {
          available = `\nAvailable printers: ${names.join(", ")}`;
        }
      } catch {
        // lpstat itself failed — no CUPS printers at all
      }

      throw new Error(
        `Printer "${printerName}" not found in CUPS.${available || "\nNo printers are configured. Add one via System Settings > Printers & Scanners."}`,
      );
    }

    const { writeFile, unlink } = await import("fs/promises");
    const { join } = await import("path");
    const { tmpdir } = await import("os");

    const tmpFile = join(tmpdir(), `todo-receipt-${Date.now()}.bin`);

    try {
      await writeFile(tmpFile, buffer);
      await execAsync(`lp -d "${printerName}" -o raw "${tmpFile}"`);
    } finally {
      try {
        await unlink(tmpFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

}
