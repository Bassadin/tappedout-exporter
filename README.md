# TappedOut Exporter

Back up every Magic: The Gathering deck in a TappedOut folder on a cron schedule. The exporter
stores both TappedOut's original CSV and normalized JSON. Unlike the plain-text export, CSV
preserves:

- board and quantity
- card name and printing
- foil, proxy, altered, and signed state
- condition and language
- commander state
- any additional columns TappedOut adds in the future (under `raw`)

The tool never deletes an old deck directory. If a deck disappears from the folder, its last backup
remains on disk.

## Quick start with Docker Compose

```sh
cp .env.example .env
docker compose up -d --build
docker compose logs -f
```

The included example is configured for:

`https://tappedout.net/mtg-deck-folders/09-02-18-edh/`

Backups appear under:

```text
backups/
├── catalog.json
└── decks/
    └── kumena-tappidity-tap-tap/
        ├── deck.csv
        └── deck.json
```

The container runs immediately at startup by default, then at `CRON_SCHEDULE`. The default is
`0 3 * * *` (03:00 each day) in the timezone from `TZ`.

Run a one-off backup:

```sh
docker compose run --rm -e MODE=once tappedout-exporter
```

## Configuration

| Variable             | Default                         | Meaning                                                          |
| -------------------- | ------------------------------- | ---------------------------------------------------------------- |
| `FOLDER_URL`         | none in the app                 | TappedOut folder discovered through its structured folder API    |
| `DECK_URLS`          | empty                           | Comma/newline-separated deck URLs to add or use without a folder |
| `OUTPUT_DIR`         | `./backups` (`/data` in Docker) | Persistent destination                                           |
| `CRON_SCHEDULE`      | `0 3 * * *`                     | Five-field cron expression                                       |
| `TZ`                 | `UTC`                           | IANA timezone used to evaluate the schedule                      |
| `RUN_ON_START`       | `true`                          | Back up immediately when the container starts                    |
| `TAPPEDOUT_COOKIE`   | empty                           | Complete Cookie header for private content                       |
| `REQUEST_DELAY_MS`   | `1000`                          | Minimum pause between TappedOut requests                         |
| `REQUEST_TIMEOUT_MS` | `60000`                         | Per-request timeout                                              |
| `MAX_RETRIES`        | `4`                             | Retries for throttling and server failures                       |
| `USER_AGENT`         | descriptive default             | HTTP User-Agent                                                  |

Only HTTPS URLs on `tappedout.net` are accepted, so an authentication cookie cannot accidentally be
sent to another host. Put secrets in `.env`; it is ignored by Git.

## Run with Deno

Requires Deno 2.

```sh
$env:FOLDER_URL="https://tappedout.net/mtg-deck-folders/09-02-18-edh/"
deno task once
```

For a scheduled foreground process, use `deno task start`.

## Backup format and change behavior

The source endpoint is `?fmt=csv`, with a cache-buster matching TappedOut's own download UI.
`deck.csv` is the lossless source export. `deck.json` provides typed booleans and quantities while
retaining every original field in `raw`.

Files are rewritten only when their remote content changes, which keeps NAS snapshots and Git
histories quiet. `catalog.json` lists decks currently discovered in the configured folder;
previously downloaded deck folders remain available even after removal from that catalog.

## Development

```sh
deno task check
deno task test
```

This project is an independent backup client and is not affiliated with TappedOut.net or Wizards of
the Coast.
