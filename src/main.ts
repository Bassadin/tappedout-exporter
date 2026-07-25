import { runBackup } from "./backup.ts";
import { loadConfig } from "./config.ts";
import { cronMatches, zonedMinuteKey } from "./cron.ts";

const config = loadConfig();
const once = Deno.args.includes("--once") || Deno.env.get("MODE")?.toLowerCase() === "once";
let running = false;

async function execute(): Promise<void> {
  if (running) {
    console.warn("[backup] Previous run is still active; skipping overlapping run");
    return;
  }
  running = true;
  const started = Date.now();
  try {
    const result = await runBackup(config);
    console.log(
      `[backup] Complete: ${result.discovered} decks, ${result.changed} changed, ` +
        `${result.unchanged} unchanged (${Date.now() - started} ms)`,
    );
  } finally {
    running = false;
  }
}

if (once) {
  await execute();
} else {
  console.log(
    `[scheduler] Schedule "${config.cronSchedule}" in ${config.timezone}; ` +
      `run on start: ${config.runOnStart}`,
  );

  let lastMinute = "";
  if (config.runOnStart) {
    lastMinute = zonedMinuteKey(new Date(), config.timezone);
    await execute();
  }

  while (true) {
    const now = new Date();
    const minute = zonedMinuteKey(now, config.timezone);
    if (
      minute !== lastMinute &&
      cronMatches(config.cronSchedule, now, config.timezone)
    ) {
      lastMinute = minute;
      try {
        await execute();
      } catch (error) {
        console.error("[backup] Scheduled run failed:", error);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}
