import { Cron } from "jsr:@hexagon/croner@10.0.1";
import { runBackup } from "./backup.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();
const once = Deno.args.includes("--once") || Deno.env.get("MODE")?.toLowerCase() === "once";

async function execute(): Promise<void> {
  const started = Date.now();
  const result = await runBackup(config);
  console.log(
    `[backup] Complete: ${result.discovered} decks, ${result.changed} changed, ` +
      `${result.unchanged} unchanged (${Date.now() - started} ms)`,
  );
}

if (once) {
  await execute();
} else {
  console.log(
    `[scheduler] Schedule "${config.cronSchedule}" in ${config.timezone}; ` +
      `run on start: ${config.runOnStart}`,
  );

  if (config.runOnStart) {
    await execute();
  }

  const job = new Cron(
    config.cronSchedule,
    {
      catch: (error) => console.error("[backup] Scheduled run failed:", error),
      protect: () => console.warn("[backup] Previous run is active; skipping overlapping run"),
      timezone: config.timezone,
    },
    execute,
  );
  console.log(`[scheduler] Next run: ${job.nextRun()?.toISOString() ?? "none"}`);
}
