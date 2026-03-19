export interface ReceiptTheme {
  id: string;
  headerName: string;
  footerType: 'ops' | 'grocery';
}

export const RECEIPT_THEMES: Record<string, ReceiptTheme> = {
  ops: {
    id: 'ops',
    headerName: 'ASHNI OPS TERMINAL',
    footerType: 'ops',
  },
  grocery: {
    id: 'grocery',
    headerName: "ASHNI'S MARKET RUN",
    footerType: 'grocery',
  },
};

export const DEFAULT_THEME: ReceiptTheme = RECEIPT_THEMES.ops;
