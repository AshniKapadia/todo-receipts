// Configuration file types

export interface ReceiptConfig {
  version: string;
  printer?: string;
  serverPort?: number;
}

export const DEFAULT_CONFIG: ReceiptConfig = {
  version: "2.0.0",
  serverPort: 3000,
};
