import { dirname, join } from "jsr:@std/path@1.1.2";
import type { Catalog, Config, DeckBackup } from "./types.ts";
import { deckSlug, normalizeDeckUrl, TappedOutClient } from "./tappedout.ts";

async function readTextIfPresent(path: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  }
}

async function writeIfChanged(path: string, content: string): Promise<boolean> {
  if (await readTextIfPresent(path) === content) return false;
  await Deno.mkdir(dirname(path), { recursive: true });
  await Deno.writeTextFile(path, content);
  return true;
}

export interface BackupResult {
  discovered: number;
  changed: number;
  unchanged: number;
}

export async function runBackup(config: Config): Promise<BackupResult> {
  const client = new TappedOutClient(config);
  const urls = new Set(config.deckUrls.map(normalizeDeckUrl));
  if (config.folderUrl) {
    for (const url of await client.discoverDecks(config.folderUrl)) urls.add(url);
  }
  if (urls.size === 0) {
    throw new Error("Configure FOLDER_URL and/or at least one URL in DECK_URLS");
  }

  let changed = 0;
  let unchanged = 0;
  const catalogDecks = [];

  for (const sourceUrl of [...urls].sort()) {
    const slug = deckSlug(sourceUrl);
    console.log(`[backup] Fetching ${slug}`);
    const downloaded = await client.downloadDeck(sourceUrl);
    const directory = join(config.outputDir, "decks", slug);
    const rawPath = join(directory, "deck.csv");
    const jsonPath = join(directory, "deck.json");
    const rawChanged = await writeIfChanged(rawPath, downloaded.csv);

    if (rawChanged || await readTextIfPresent(jsonPath) === null) {
      const document: DeckBackup = {
        schemaVersion: 1,
        sourceUrl,
        csvUrl: new URL("?fmt=csv", sourceUrl).toString(),
        slug,
        backedUpAt: new Date().toISOString(),
        cards: downloaded.cards,
      };
      await writeIfChanged(jsonPath, `${JSON.stringify(document, null, 2)}\n`);
      changed++;
      console.log(`[backup] Updated ${slug} (${downloaded.cards.length} rows)`);
    } else {
      unchanged++;
      console.log(`[backup] Unchanged ${slug}`);
    }

    catalogDecks.push({
      slug,
      sourceUrl,
      path: `decks/${slug}`,
    });
  }

  const catalogPath = join(config.outputDir, "catalog.json");
  const existingCatalogText = await readTextIfPresent(catalogPath);
  let catalogChanged = true;
  if (existingCatalogText) {
    try {
      const existing = JSON.parse(existingCatalogText) as Catalog;
      catalogChanged = existing.folderUrl !== config.folderUrl ||
        JSON.stringify(existing.decks) !== JSON.stringify(catalogDecks);
    } catch {
      // Replace an invalid catalog.
    }
  }
  if (catalogChanged) {
    const catalog: Catalog = {
      schemaVersion: 1,
      folderUrl: config.folderUrl,
      updatedAt: new Date().toISOString(),
      decks: catalogDecks,
    };
    await writeIfChanged(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  }

  return { discovered: urls.size, changed, unchanged };
}
