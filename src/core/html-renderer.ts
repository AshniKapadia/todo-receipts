import type { ReceiptData } from "./receipt-generator.js";
import { formatDateTime } from "../utils/formatting.js";

export class HtmlRenderer {
  /**
   * Generate HTML receipt with embedded CSS
   */
  generateHtml(data: ReceiptData, receiptText: string): string {
    const date = data.timestamp;
    const dateStr = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
    const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    const terminalNum = Math.floor(
      (data.timestamp.getTime() - new Date('2024-01-01').getTime()) / (1000 * 60 * 60 * 24)
    );
    const terminalId = String(terminalNum).padStart(6, '0');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ASHNI OPS TERMINAL - ${dateStr} ${timeStr}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 16px;
      background: #3a3a3a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .receipt-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 40px;
    }

    .receipt {
      background: #f8f8f8;
      width: 400px;
      padding: 30px 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
      position: relative;
      animation: slideIn 0.5s ease-out;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .receipt::before,
    .receipt::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      height: 15px;
      background: repeating-linear-gradient(
        90deg,
        transparent,
        transparent 10px,
        #f8f8f8 10px,
        #f8f8f8 20px
      );
    }

    .receipt::before {
      top: -15px;
    }

    .receipt::after {
      bottom: -15px;
    }

    .receipt-content {
      color: #333;
      white-space: pre;
      overflow-x: auto;
      font-size: 14px;
      line-height: 1.4;
    }

    @media print {
      body {
        background: white;
      }
      .receipt {
        box-shadow: none;
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div class="receipt">
      <pre class="receipt-content">${this.escapeHtml(receiptText)}</pre>
    </div>
  </div>

  <script>
    // Add keyboard shortcut to close window
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        window.close();
      }
    });

    // Log receipt info
    console.log('ASHNI OPS TERMINAL Receipt Generated!');
    console.log('Items:', ${data.totalCount});
    console.log('Press ESC to close or Cmd+P to print');
  </script>
</body>
</html>`;
  }

  /**
   * Escape HTML entities
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
