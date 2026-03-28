export interface ReceiptTheme {
  id: string;
  headerName: string;
  footerType: 'ops' | 'grocery' | 'bigday';
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
  bigday: {
    id: 'bigday',
    headerName: "AMOLI'S BIG DAY",
    footerType: 'bigday',
  },
};

export const DEFAULT_THEME: ReceiptTheme = RECEIPT_THEMES.ops;
