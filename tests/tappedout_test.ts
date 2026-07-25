import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";
import {
  deckSlug,
  extractDeckUrls,
  extractFolderId,
  normalizeDeckUrl,
  parseDeckCsv,
} from "../src/tappedout.ts";

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
