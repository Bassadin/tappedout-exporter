import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";
import { cronMatches, parseCron } from "../src/cron.ts";

Deno.test("cron matches in the configured timezone", () => {
  const date = new Date("2026-07-25T01:00:00Z");
  assertEquals(cronMatches("0 3 * * *", date, "Europe/Berlin"), true);
  assertEquals(cronMatches("0 4 * * *", date, "Europe/Berlin"), false);
});

Deno.test("cron supports lists, ranges, and steps", () => {
  const date = new Date("2026-07-25T10:30:00Z");
  assertEquals(cronMatches("*/15 10-12 * * 0,6", date, "UTC"), true);
});

Deno.test("cron rejects six-field expressions", () => {
  assertThrows(() => parseCron("0 0 3 * * *"), Error, "five fields");
});
