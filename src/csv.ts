import { parse } from "jsr:@std/csv@1.0.6/parse";

/** Parse CSV with Deno's maintained standard-library implementation. */
export function parseCsv(input: string): string[][] {
    return parse(input).filter((candidate) =>
        candidate.length > 1 || (candidate.length === 1 && candidate[0] !== "")
    );
}

export function recordsFromCsv(input: string): Record<string, string>[] {
    const rows = parseCsv(input);
    if (rows.length === 0) {
        throw new Error("TappedOut returned an empty CSV document");
    }

    const headers = rows[0].map((header) => header.trim());
    if (headers.some((header) => header === "")) {
        throw new Error("TappedOut CSV contains an empty column name");
    }

    return rows.slice(1).map((values, rowIndex) => {
        if (values.length > headers.length) {
            throw new Error(`CSV row ${rowIndex + 2} contains more values than the header`);
        }

        return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    });
}
