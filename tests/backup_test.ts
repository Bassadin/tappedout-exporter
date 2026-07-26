import { assertEquals, assertMatch } from "jsr:@std/assert@1.0.14";
import { runBackup } from "../src/backup.ts";
import type { Config, DeckBackup } from "../src/types.ts";

const deckUrl = "https://tappedout.net/mtg-decks/example-deck/";
const csv = [
    "Board,Qty,Name,Printing,Foil,Alter,Signed,Condition,Language,Commander,Proxy",
    "main,1,Example Commander,,,,,,,True,",
].join("\n");

const config = (outputDir: string): Config => ({
    folderUrl: null,
    deckUrls: [deckUrl],
    outputDir,
    cronSchedule: "0 3 * * *",
    timezone: "UTC",
    runOnStart: false,
    requestDelayMs: 0,
    requestTimeoutMs: 1_000,
    maxRetries: 0,
    maxConcurrency: 1,
    cookie: null,
    userAgent: "test-agent",
});

async function withMockedFetch(
    action: (setDescription: (value: string) => void) => Promise<void>,
): Promise<void> {
    const originalFetch = globalThis.fetch;
    let description = "First description";
    globalThis.fetch = ((input: RequestInfo | URL) => {
        const url = new URL(input.toString());
        if (url.searchParams.get("fmt") === "csv") return Promise.resolve(new Response(csv));
        return Promise.resolve(
            new Response(`
      <meta property="og:title" content="MTG Deck: Example Deck">
      <meta property="og:description" content="${description}">
    `),
        );
    }) as typeof fetch;

    try {
        await action((value) => description = value);
    } finally {
        globalThis.fetch = originalFetch;
    }
}

Deno.test("runBackup writes card and metadata changes without rewriting unchanged decks", async () => {
    const outputDir = await Deno.makeTempDir({ dir: "tests", prefix: "backup-test-" });
    try {
        await withMockedFetch(async (setDescription) => {
            assertEquals(await runBackup(config(outputDir)), {
                discovered: 1,
                changed: 1,
                unchanged: 0,
            });
            assertEquals(await runBackup(config(outputDir)), {
                discovered: 1,
                changed: 0,
                unchanged: 1,
            });
            setDescription("Updated description");
            assertEquals(await runBackup(config(outputDir)), {
                discovered: 1,
                changed: 1,
                unchanged: 0,
            });

            const document = JSON.parse(
                await Deno.readTextFile(`${outputDir}/decks/example-deck/deck.json`),
            ) as DeckBackup;
            assertEquals(document.metadata, {
                title: "Example Deck",
                description: "Updated description",
                commanderNames: ["Example Commander"],
            });
            assertEquals(document.cards[0].commander, true);
            assertMatch(document.csvUrl, /\?fmt=csv$/);
        });
    } finally {
        await Deno.remove(outputDir, { recursive: true });
    }
});
