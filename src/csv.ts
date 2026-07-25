/**
 * Small RFC 4180-compatible parser. TappedOut returns commas, quoted fields,
 * escaped quotes and CRLF, so keeping this local avoids a runtime dependency.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];

    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (quoted) {
    throw new Error("Invalid CSV: unterminated quoted field");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((candidate) =>
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
