import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";
import { parseCsv, recordsFromCsv } from "../src/csv.ts";

Deno.test("parseCsv handles commas, quotes, escaped quotes, and CRLF", () => {
    const input = 'Name,Note\r\n"Evendo, Waking Haven","said ""hello"""\r\nFoil,\r\n';
    assertEquals(parseCsv(input), [
        ["Name", "Note"],
        ["Evendo, Waking Haven", 'said "hello"'],
        ["Foil", ""],
    ]);
});

Deno.test("recordsFromCsv maps missing trailing values to empty strings", () => {
    assertEquals(recordsFromCsv("A,B,C\n1,2\n"), [{ A: "1", B: "2", C: "" }]);
});

Deno.test("parseCsv rejects an unterminated quoted field", () => {
    assertThrows(() => parseCsv('Name\n"broken'), SyntaxError);
});
