import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";
import {
  deckSlug,
  extractDeckMetadata,
  extractDeckUrls,
  extractFolderId,
  normalizeDeckUrl,
  parseDeckCsv,
} from "../src/tappedout.ts";

Deno.test("extractDeckMetadata reads the deck's Open Graph title and description", () => {
  const html = `
    <meta property="og:title" content="MTG Deck: Kumena - Tappidity Tap Tap">
    <meta property="og:description" content="Draft for a Kumena Deck ">
  `;

  assertEquals(extractDeckMetadata(html), {
    title: "Kumena - Tappidity Tap Tap",
    description: "Draft for a Kumena Deck",
    commanderNames: [],
  });
});

Deno.test("normalizeDeckUrl drops query strings and adds a trailing slash", () => {
  assertEquals(
    normalizeDeckUrl("https://tappedout.net/mtg-decks/example/?fmt=csv"),
    "https://tappedout.net/mtg-decks/example/",
  );
  assertEquals(deckSlug("https://tappedout.net/mtg-decks/example"), "example");
});

Deno.test("URLs on other origins are rejected", () => {
  assertThrows(
    () => normalizeDeckUrl("https://example.com/mtg-decks/example/"),
    Error,
    "Only https://tappedout.net",
  );
});

Deno.test("extractDeckUrls finds and deduplicates folder deck links", () => {
  const html = `
    <a href="/mtg-decks/alpha/">Alpha</a>
    <a href="https://tappedout.net/mtg-decks/beta/?foo=bar">Beta</a>
    <a href="/mtg-decks/alpha/?fmt=txt">Alpha again</a>
  `;
  assertEquals(extractDeckUrls(html), [
    "https://tappedout.net/mtg-decks/alpha/",
    "https://tappedout.net/mtg-decks/beta/",
  ]);
});

Deno.test("extractFolderId reads the ID used by TappedOut's folder API", () => {
  assertEquals(extractFolderId("window.django = { folderId: 237742, pageURL: '/' };"), 237742);
});

Deno.test("parseDeckCsv preserves TappedOut metadata and future columns", () => {
  const csv = [
    "Board,Qty,Name,Printing,Foil,Alter,Signed,Condition,Language,Commander,Proxy,Future",
    'main,1,"Kumena, Tyrant of Orazca",RIX,True,,,NM,DE,True,,kept',
    "side,2,Academy Ruins,MMA,,,,,,,True,also kept",
  ].join("\n");

  const cards = parseDeckCsv(csv);
  assertEquals(cards[0].foil, true);
  assertEquals(cards[0].commander, true);
  assertEquals(cards[0].language, "DE");
  assertEquals(cards[0].raw.Future, "kept");
  assertEquals(cards[1].proxy, true);
  assertEquals(cards[1].raw.Future, "also kept");
});

Deno.test("parseDeckCsv handles the real Kumena TappedOut export", async () => {
  const fixtureUrl = new URL("./fixtures/kumena-tappidity-tap-tap.csv", import.meta.url);
  const cards = parseDeckCsv(await Deno.readTextFile(fixtureUrl));

  assertEquals(cards.length, 84);
  assertEquals(cards.reduce((total, card) => total + card.quantity, 0), 100);
  assertEquals(cards.filter((card) => card.proxy).length, 22);
  assertEquals(cards.filter((card) => card.foil).length, 0);
  assertEquals(cards.filter((card) => card.commander).length, 1);
  assertEquals(cards.filter((card) => card.language !== null).length, 14);
  assertEquals(cards.filter((card) => card.printing !== null).length, 52);

  const commander = cards.find((card) => card.commander);
  assertEquals(commander?.name, "Kumena, Tyrant of Orazca");
  assertEquals(cards.find((card) => card.name === "Academy Ruins")?.proxy, true);
});
