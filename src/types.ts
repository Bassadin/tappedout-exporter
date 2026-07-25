export const EXPECTED_COLUMNS = [
  "Board",
  "Qty",
  "Name",
  "Printing",
  "Foil",
  "Alter",
  "Signed",
  "Condition",
  "Language",
  "Commander",
  "Proxy",
] as const;

export type ExpectedColumn = (typeof EXPECTED_COLUMNS)[number];

export interface Card {
  board: string;
  quantity: number;
  name: string;
  printing: string | null;
  foil: boolean;
  alter: boolean;
  signed: boolean;
  condition: string | null;
  language: string | null;
  commander: boolean;
  proxy: boolean;
  /** All values exactly as returned by TappedOut, including future columns. */
  raw: Record<string, string>;
}

export interface DeckBackup {
  schemaVersion: 1;
  sourceUrl: string;
  csvUrl: string;
  slug: string;
  backedUpAt: string;
  cards: Card[];
}

export interface CatalogDeck {
  slug: string;
  sourceUrl: string;
  path: string;
}

export interface Catalog {
  schemaVersion: 1;
  folderUrl: string | null;
  updatedAt: string;
  decks: CatalogDeck[];
}

export interface Config {
  folderUrl: string | null;
  deckUrls: string[];
  outputDir: string;
  cronSchedule: string;
  timezone: string;
  runOnStart: boolean;
  requestDelayMs: number;
  requestTimeoutMs: number;
  maxRetries: number;
  cookie: string | null;
  userAgent: string;
}
