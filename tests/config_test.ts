import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";
import { loadConfig } from "../src/config.ts";

const CONFIG_KEYS = [
  "FOLDER_URL",
  "DECK_URLS",
  "OUTPUT_DIR",
  "CRON_SCHEDULE",
  "TZ",
  "RUN_ON_START",
  "REQUEST_DELAY_MS",
  "REQUEST_TIMEOUT_MS",
  "MAX_RETRIES",
  "MAX_CONCURRENCY",
  "TAPPEDOUT_COOKIE",
  "USER_AGENT",
];

function withConfigEnv(values: Record<string, string>, action: () => void): void {
  const original = new Map(CONFIG_KEYS.map((key) => [key, Deno.env.get(key)]));
  try {
    for (const key of CONFIG_KEYS) Deno.env.delete(key);
    for (const [key, value] of Object.entries(values)) Deno.env.set(key, value);
    action();
  } finally {
    for (const key of CONFIG_KEYS) {
      Deno.env.delete(key);
      const value = original.get(key);
      if (value !== undefined) Deno.env.set(key, value);
    }
  }
}

Deno.test("loadConfig reads folder, worker, and request settings", () => {
  withConfigEnv({
    FOLDER_URL: "https://tappedout.net/mtg-deck-folders/example/",
    DECK_URLS: "https://tappedout.net/mtg-decks/alpha/,\nhttps://tappedout.net/mtg-decks/beta/",
    OUTPUT_DIR: "./custom-backups",
    CRON_SCHEDULE: "0 4 * * *",
    TZ: "Europe/Berlin",
    RUN_ON_START: "no",
    REQUEST_DELAY_MS: "2500",
    REQUEST_TIMEOUT_MS: "90000",
    MAX_RETRIES: "7",
    MAX_CONCURRENCY: "2",
    TAPPEDOUT_COOKIE: "session=secret",
    USER_AGENT: "test-agent",
  }, () => {
    assertEquals(loadConfig(), {
      folderUrl: "https://tappedout.net/mtg-deck-folders/example/",
      deckUrls: [
        "https://tappedout.net/mtg-decks/alpha/",
        "https://tappedout.net/mtg-decks/beta/",
      ],
      outputDir: "./custom-backups",
      cronSchedule: "0 4 * * *",
      timezone: "Europe/Berlin",
      runOnStart: false,
      requestDelayMs: 2500,
      requestTimeoutMs: 90000,
      maxRetries: 7,
      maxConcurrency: 2,
      cookie: "session=secret",
      userAgent: "test-agent",
    });
  });
});

Deno.test("loadConfig rejects invalid bounded integer settings", () => {
  withConfigEnv({ MAX_CONCURRENCY: "0" }, () => {
    assertThrows(loadConfig, Error, "MAX_CONCURRENCY must be an integer of at least 1");
  });
});
