import { pooledMap } from "jsr:@std/async@1.5.0/pool";
import { dirname, join } from "jsr:@std/path@1.1.2";
import type { Catalog, Config, DeckBackup, DeckMetadata } from "./types.ts";
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

function metadataMatches(existingJson: string | null, metadata: DeckMetadata): boolean {
  if (existingJson === null) return false;
  try {
    const existing = JSON.parse(existingJson) as Partial<DeckBackup>;
    return existing.metadata?.title === metadata.title &&
      existing.metadata.description === metadata.description;
  } catch {
    return false;
  }
}

export interface BackupResult {
  discovered: number;
  changed: number;
  unchanged: number;
}

export async function runBackup(config: Config): Promise<BackupResult> {
  const urls = new Set(config.deckUrls.map(normalizeDeckUrl));
  if (config.folderUrl) {
    const client = new TappedOutClient(config);
    for (const url of await client.discoverDecks(config.folderUrl)) urls.add(url);
  }
  if (urls.size === 0) {
    throw new Error("Configure FOLDER_URL and/or at least one URL in DECK_URLS");
  }

  const processDeck = async (sourceUrl: string) => {
    const slug = deckSlug(sourceUrl);
    console.log(`[backup] Fetching ${slug}`);
    // Each worker has its own request pacing state, so raising MAX_CONCURRENCY
    // later genuinely permits parallel HTTP requests.
    const client = new TappedOutClient(config);
    const downloaded = await client.downloadDeck(sourceUrl);
    const directory = join(config.outputDir, "decks", slug);
    const rawPath = join(directory, "deck.csv");
    const jsonPath = join(directory, "deck.json");
    const rawChanged = await writeIfChanged(rawPath, downloaded.csv);
    const existingJson = await readTextIfPresent(jsonPath);

    if (rawChanged || !metadataMatches(existingJson, downloaded.metadata)) {
      const document: DeckBackup = {
        schemaVersion: 1,
        sourceUrl,
        csvUrl: new URL("?fmt=csv", sourceUrl).toString(),
        slug,
        backedUpAt: new Date().toISOString(),
        metadata: downloaded.metadata,
        cards: downloaded.cards,
      };
      await writeIfChanged(jsonPath, `${JSON.stringify(document, null, 2)}\n`);
      console.log(`[backup] Updated ${slug} (${downloaded.cards.length} rows)`);
      return { changed: true, slug, sourceUrl };
    } else {
      console.log(`[backup] Unchanged ${slug}`);
      return { changed: false, slug, sourceUrl };
    }
  };

  const processed = await Array.fromAsync(
    pooledMap(config.maxConcurrency, [...urls].sort(), processDeck),
  );
  const changed = processed.filter((deck) => deck.changed).length;
  const unchanged = processed.length - changed;
  const catalogDecks = processed.map(({ slug, sourceUrl }) => ({
    slug,
    sourceUrl,
    path: `decks/${slug}`,
  }));

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
