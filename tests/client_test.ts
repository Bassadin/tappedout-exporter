import { assertEquals, assertMatch } from "jsr:@std/assert@1.0.14";
import { RequestPacer, TappedOutClient } from "../src/tappedout.ts";
import type { Config } from "../src/types.ts";

const config: Config = {
    folderUrl: null,
    deckUrls: [],
    outputDir: "./backups",
    cronSchedule: "0 3 * * *",
    timezone: "UTC",
    runOnStart: false,
    requestDelayMs: 0,
    requestTimeoutMs: 1_000,
    maxRetries: 0,
    maxConcurrency: 1,
    cookie: null,
    userAgent: "test-agent",
};

async function withFetch(
    handler: (url: URL) => Response,
    action: () => Promise<void>,
): Promise<void> {
    const originalFetch = globalThis.fetch;
    globalThis.fetch =
        ((input: RequestInfo | URL) =>
            Promise.resolve(handler(new URL(input.toString())))) as typeof fetch;
    try {
        await action();
    } finally {
        globalThis.fetch = originalFetch;
    }
}

Deno.test("discoverDecks follows TappedOut folder API pagination", async () => {
    const requested: string[] = [];
    await withFetch((url) => {
        requested.push(`${url.pathname}${url.search}`);
        if (url.pathname === "/mtg-deck-folders/example/") {
            return new Response("window.django = { folderId: 7 };");
        }
        if (url.pathname === "/api/folder/7/detail/") {
            return new Response(JSON.stringify({
                folder: { decks: [{ url: "/mtg-decks/alpha/" }], nextDecksIndex: 25 },
            }));
        }
        return new Response(JSON.stringify({
            results: [{ url: "/mtg-decks/beta/" }],
            nextDecksIndex: -1,
        }));
    }, async () => {
        const client = new TappedOutClient(config);
        assertEquals(
            await client.discoverDecks("https://tappedout.net/mtg-deck-folders/example/"),
            ["https://tappedout.net/mtg-decks/alpha/", "https://tappedout.net/mtg-decks/beta/"],
        );
    });
    assertEquals(requested, [
        "/mtg-deck-folders/example/",
        "/api/folder/7/detail/",
        "/api/folder/7/decks/?start=25&amount=25",
    ]);
});

Deno.test("downloadDeck collects page metadata and commander names", async () => {
    await withFetch((url) => {
        if (url.searchParams.get("fmt") === "csv") {
            return new Response([
                "Board,Qty,Name,Printing,Foil,Alter,Signed,Condition,Language,Commander,Proxy",
                "main,1,Commander One,,,,,,,True,",
                "main,1,Commander Two,,,,,,,True,",
            ].join("\r\n"));
        }
        return new Response(`
      <meta property="og:title" content="MTG Deck: Partner Deck">
      <meta property="og:description" content="Two commanders">
    `);
    }, async () => {
        const downloaded = await new TappedOutClient(config).downloadDeck(
            "https://tappedout.net/mtg-decks/partner-deck/",
        );
        assertEquals(downloaded.metadata, {
            title: "Partner Deck",
            description: "Two commanders",
            commanderNames: ["Commander One", "Commander Two"],
        });
        assertEquals(downloaded.csv.includes("\r\n"), false);
        assertMatch(downloaded.csvUrl, /\?fmt=csv&cb=\d+$/);
    });
});

Deno.test("RequestPacer spaces concurrent request starts", async () => {
    const pacer = new RequestPacer(25);
    const starts: number[] = [];
    await Promise.all(Array.from({ length: 3 }, async () => {
        await pacer.waitForTurn();
        starts.push(Date.now());
    }));

    assertEquals(starts.length, 3);
    assertEquals(starts[1] - starts[0] >= 15, true);
    assertEquals(starts[2] - starts[1] >= 15, true);
});
