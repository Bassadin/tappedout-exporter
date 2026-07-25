import { Cron } from "jsr:@hexagon/croner@10.0.1";
import type { Config } from "./types.ts";
import { assertTappedOutUrl, normalizeDeckUrl } from "./tappedout.ts";

function booleanEnv(name: string, fallback: boolean): boolean {
  const value = Deno.env.get(name);
  if (value === undefined) return fallback;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  throw new Error(`${name} must be true or false`);
}

function integerEnv(name: string, fallback: number, minimum: number): number {
  const raw = Deno.env.get(name);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer of at least ${minimum}`);
  }
  return value;
}

export function loadConfig(): Config {
  const folderValue = Deno.env.get("FOLDER_URL")?.trim() || null;
  if (folderValue) assertTappedOutUrl(folderValue);

  const deckUrls = (Deno.env.get("DECK_URLS") ?? "")
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeDeckUrl);

  const cronSchedule = Deno.env.get("CRON_SCHEDULE")?.trim() || "0 3 * * *";

  const timezone = Deno.env.get("TZ")?.trim() || "UTC";
  try {
    const validationJob = new Cron(cronSchedule, { paused: true, timezone });
    validationJob.stop();
  } catch (error) {
    throw new Error(`Invalid CRON_SCHEDULE or TZ: ${error}`, { cause: error });
  }

  return {
    folderUrl: folderValue,
    deckUrls,
    outputDir: Deno.env.get("OUTPUT_DIR")?.trim() || "./backups",
    cronSchedule,
    timezone,
    runOnStart: booleanEnv("RUN_ON_START", true),
    requestDelayMs: integerEnv("REQUEST_DELAY_MS", 1_000, 0),
    requestTimeoutMs: integerEnv("REQUEST_TIMEOUT_MS", 60_000, 1_000),
    maxRetries: integerEnv("MAX_RETRIES", 4, 0),
    maxConcurrency: integerEnv("MAX_CONCURRENCY", 1, 1),
    cookie: Deno.env.get("TAPPEDOUT_COOKIE")?.trim() || null,
    userAgent: Deno.env.get("USER_AGENT")?.trim() ||
      "Mozilla/5.0 (compatible; tappedout-exporter/0.1; personal deck backup)",
  };
}
