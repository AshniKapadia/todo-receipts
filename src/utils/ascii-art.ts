/**
 * ASCII art headers for receipts
 */

export const TODO_HEADER = `        TO-DO LIST`;

/**
 * Get the header
 */
export function getHeader(): string {
  return TODO_HEADER;
}

/**
 * Receipt section separators
 */
export const SEPARATOR = "━".repeat(35);
export const LIGHT_SEPARATOR = "─".repeat(35);
