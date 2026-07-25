import { type Card, type Config, EXPECTED_COLUMNS } from "./types.ts";
import { parseCsv, recordsFromCsv } from "./csv.ts";

const TAPPEDOUT_HOST = "tappedout.net";
const DECK_PATH = /^\/mtg-decks\/([^/]+)\/?$/;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function assertTappedOutUrl(input: string): URL {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.hostname !== TAPPEDOUT_HOST) {
    throw new Error(`Only https://${TAPPEDOUT_HOST} URLs are accepted: ${input}`);
  }
  url.hash = "";
  return url;
}

export function normalizeDeckUrl(input: string): string {
  const url = assertTappedOutUrl(input);
  const match = url.pathname.match(DECK_PATH);
  if (!match) {
    throw new Error(`Not a TappedOut deck URL: ${input}`);
  }
  return `https://${TAPPEDOUT_HOST}/mtg-decks/${match[1]}/`;
}

export function deckSlug(input: string): string {
  const url = new URL(normalizeDeckUrl(input));
  const match = url.pathname.match(DECK_PATH);
  if (!match) throw new Error(`Could not determine deck slug: ${input}`);
  return match[1];
}

export function csvUrl(input: string): string {
  const url = new URL(normalizeDeckUrl(input));
  url.searchParams.set("fmt", "csv");
  // TappedOut's own UI supplies this cache-buster. It prevents stale CDN exports.
  url.searchParams.set("cb", Date.now().toString());
  return url.toString();
}

export function extractDeckUrls(html: string): string[] {
  const decoded = html.replaceAll("&amp;", "&");
  const urls = new Set<string>();
  const pattern = /href\s*=\s*["']([^"']*\/mtg-decks\/[^"'?#/]+\/?(?:[?#][^"']*)?)["']/gi;

  for (const match of decoded.matchAll(pattern)) {
    try {
      urls.add(normalizeDeckUrl(new URL(match[1], `https://${TAPPEDOUT_HOST}`).toString()));
    } catch {
      // Ignore unrelated or malformed anchors.
    }
  }

  return [...urls].sort();
}

export function parseDeckCsv(csv: string): Card[] {
  if (/^\s*<!doctype html/i.test(csv) || /^\s*<html/i.test(csv)) {
    throw new Error("TappedOut returned HTML instead of CSV");
  }

  const header = parseCsv(csv)[0] ?? [];
  const missing = EXPECTED_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new Error(`TappedOut CSV is missing expected columns: ${missing.join(", ")}`);
  }

  return recordsFromCsv(csv).map((raw, index): Card => {
    const quantity = Number(raw.Qty);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error(`Invalid quantity on CSV row ${index + 2}: ${raw.Qty}`);
    }
    const truthy = (value: string): boolean => value.trim().toLowerCase() === "true";
    const optional = (value: string): string | null => value === "" ? null : value;

    return {
      board: raw.Board,
      quantity,
      name: raw.Name,
      printing: optional(raw.Printing),
      foil: truthy(raw.Foil),
      alter: truthy(raw.Alter),
      signed: truthy(raw.Signed),
      condition: optional(raw.Condition),
      language: optional(raw.Language),
      commander: truthy(raw.Commander),
      proxy: truthy(raw.Proxy),
      raw,
    };
  });
}

export function extractFolderId(html: string): number {
  const match = html.match(/\bfolderId\s*:\s*(\d+)/);
  const folderId = Number(match?.[1]);
  if (!Number.isInteger(folderId) || folderId < 1) {
    throw new Error("Could not find the folder ID in TappedOut's folder page");
  }
  return folderId;
}

interface FolderDeck {
  url: string;
}

interface FolderDetailResponse {
  folder?: {
    decks?: FolderDeck[];
    nextDecksIndex?: number;
  };
}

interface FolderPageResponse {
  results?: FolderDeck[];
  nextDecksIndex?: number;
}

function parseJson<T>(source: string, label: string): T {
  try {
    return JSON.parse(source) as T;
  } catch (error) {
    throw new Error(`TappedOut returned invalid JSON for ${label}`, { cause: error });
  }
}

export class TappedOutClient {
  #lastRequestAt = 0;

  constructor(private readonly config: Config) {}

  async #fetch(url: string, accept: string): Promise<string> {
    const target = assertTappedOutUrl(url);
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      const waitFor = this.config.requestDelayMs - (Date.now() - this.#lastRequestAt);
      if (waitFor > 0) await sleep(waitFor);
      this.#lastRequestAt = Date.now();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
      try {
        const headers = new Headers({
          "Accept": accept,
          "Accept-Language": "en-US,en;q=0.8",
          "Cache-Control": "no-cache",
          "Referer": `https://${TAPPEDOUT_HOST}/`,
          "User-Agent": this.config.userAgent,
        });
        if (this.config.cookie) headers.set("Cookie", this.config.cookie);

        const response = await fetch(target, {
          headers,
          redirect: "follow",
          signal: controller.signal,
        });
        const body = await response.text();

        if (response.ok) return body;
        lastError = new Error(
          `TappedOut returned ${response.status} ${response.statusText} for ${target}`,
        );
        if (response.status < 500 && response.status !== 429) throw lastError;

        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfter = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader);
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 2 ** attempt * 1000;
        if (attempt < this.config.maxRetries) {
          console.warn(
            `[http] ${response.status} from TappedOut; retrying in ${backoff} ms ` +
              `(${attempt + 1}/${this.config.maxRetries})`,
          );
          await sleep(backoff);
        }
      } catch (error) {
        lastError = error;
        if (attempt < this.config.maxRetries) {
          const backoff = 2 ** attempt * 1000;
          console.warn(
            `[http] Request failed; retrying in ${backoff} ms ` +
              `(${attempt + 1}/${this.config.maxRetries}): ${error}`,
          );
          await sleep(backoff);
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async discoverDecks(folderUrl: string): Promise<string[]> {
    const first = assertTappedOutUrl(folderUrl);
    if (!first.pathname.startsWith("/mtg-deck-folders/")) {
      throw new Error(`Not a TappedOut deck folder URL: ${folderUrl}`);
    }

    const html = await this.#fetch(first.toString(), "text/html");
    const folderId = extractFolderId(html);
    const detailUrl = new URL(`/api/folder/${folderId}/detail/`, first);
    const detail = parseJson<FolderDetailResponse>(
      await this.#fetch(detailUrl.toString(), "application/json"),
      "folder detail",
    );
    if (!Array.isArray(detail.folder?.decks)) {
      throw new Error("TappedOut's folder detail response did not contain a deck list");
    }

    const decks = new Set<string>();
    for (const deck of detail.folder.decks) {
      if (typeof deck.url === "string") {
        decks.add(normalizeDeckUrl(new URL(deck.url, first).toString()));
      }
    }

    let nextIndex = detail.folder.nextDecksIndex ?? -1;
    let pages = 0;
    while (nextIndex >= 0) {
      if (pages++ >= 50) {
        throw new Error("Folder API pagination exceeded the 50-page safety limit");
      }
      const pageUrl = new URL(`/api/folder/${folderId}/decks/`, first);
      pageUrl.searchParams.set("start", nextIndex.toString());
      pageUrl.searchParams.set("amount", "25");
      const page = parseJson<FolderPageResponse>(
        await this.#fetch(pageUrl.toString(), "application/json"),
        "folder deck page",
      );
      if (!Array.isArray(page.results) || typeof page.nextDecksIndex !== "number") {
        throw new Error("TappedOut's folder page response had an unexpected shape");
      }
      for (const deck of page.results) {
        if (typeof deck.url === "string") {
          decks.add(normalizeDeckUrl(new URL(deck.url, first).toString()));
        }
      }
      if (page.nextDecksIndex === nextIndex && page.nextDecksIndex >= 0) {
        throw new Error("TappedOut's folder pagination did not advance");
      }
      nextIndex = page.nextDecksIndex;
    }

    if (decks.size === 0) {
      throw new Error(
        "No decks found in the folder. If it is private, set TAPPEDOUT_COOKIE to your browser Cookie header.",
      );
    }
    return [...decks].sort();
  }

  async downloadDeck(deckUrl: string): Promise<{ csv: string; cards: Card[]; csvUrl: string }> {
    const exportUrl = csvUrl(deckUrl);
    const csv = (await this.#fetch(exportUrl, "text/csv,text/plain;q=0.9,*/*;q=0.1"))
      .replaceAll("\r\n", "\n");
    try {
      return { csv, cards: parseDeckCsv(csv), csvUrl: exportUrl };
    } catch (error) {
      throw new Error(`Invalid export for ${deckUrl}: ${error}`, { cause: error });
    }
  }
}
