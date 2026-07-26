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
`0 3 * * *` (03:00 each day) in the timezone from `TZ`. Scheduling uses
[Croner](https://croner.56k.guru/), including timezone/DST handling and overrun protection.

Run a one-off backup:

```sh
docker compose run --rm -e MODE=once tappedout-exporter
```

## Run a published GHCR image

After a release has been published, create `compose.ghcr.yaml` to run a fixed image version without
building the repository locally:

```yaml
services:
    tappedout-exporter:
        image: ghcr.io/bassadin/tappedout-exporter:0.2.1
        container_name: tappedout-exporter
        restart: unless-stopped
        env_file:
            - .env
        volumes:
            - ./backups:/data
```

Create `.env` from `.env.example`, then start it with:

```sh
docker compose -f compose.ghcr.yaml up -d
```

Replace `0.2.1` with the exact released version you want to run. Fixed tags make updates deliberate
and make it easy to roll back; use `:latest` only if you intentionally want every stable release.

## Configuration

| Variable             | Default                         | Meaning                                                          |
| -------------------- | ------------------------------- | ---------------------------------------------------------------- |
| `FOLDER_URL`         | none in the app                 | TappedOut folder discovered through its structured folder API    |
| `DECK_URLS`          | empty                           | Comma/newline-separated deck URLs to add or use without a folder |
| `OUTPUT_DIR`         | `./backups` (`/data` in Docker) | Persistent destination                                           |
| `CRON_SCHEDULE`      | `0 3 * * *`                     | Cron expression or Croner schedule nickname                      |
| `TZ`                 | `UTC`                           | IANA timezone used to evaluate the schedule                      |
| `RUN_ON_START`       | `true`                          | Back up immediately when the container starts                    |
| `TAPPEDOUT_COOKIE`   | empty                           | Complete Cookie header for private content                       |
| `REQUEST_DELAY_MS`   | `1000`                          | Global minimum pause between TappedOut request starts (ms)       |
| `REQUEST_TIMEOUT_MS` | `60000`                         | Per-request timeout                                              |
| `MAX_RETRIES`        | `4`                             | Retries for throttling and server failures                       |
| `MAX_CONCURRENCY`    | `1`                             | Maximum concurrent deck exports; increase cautiously             |
| `USER_AGENT`         | descriptive default             | HTTP User-Agent                                                  |

Only HTTPS URLs on `tappedout.net` are accepted, so an authentication cookie cannot accidentally be
sent to another host. Put secrets in `.env`; it is ignored by Git.

Deck discovery is necessarily sequential because TappedOut's folder API returns the page and its
pagination token in order. Deck downloads are processed by a bounded worker pool. The global
`REQUEST_DELAY_MS` applies between every request start, independently of `MAX_CONCURRENCY`, so a
pool can overlap slow responses without increasing the request rate. Start with `MAX_CONCURRENCY=1`;
if TappedOut is slow but stable, try `2` or `3` while keeping a conservative request delay (for
example, `REQUEST_DELAY_MS=2000`).

## Run with Deno

Requires Deno 2.

```powershell
Copy-Item .env.example .env
deno task --env-file=.env once
```

Unlike Docker Compose, `deno task` does not load `.env` automatically. Always pass `--env-file=.env`
when running locally, including the scheduled foreground process:

```sh
deno task --env-file=.env start
```

## Backup format and change behavior

The source endpoint is `?fmt=csv`, with a cache-buster matching TappedOut's own download UI.
`deck.csv` is the lossless source export. `deck.json` provides typed booleans and quantities while
retaining every original field in `raw`, plus the deck page's `metadata.title` and
`metadata.description` fields. `metadata.commanderNames` summarizes cards whose TappedOut CSV marks
them as commanders, including multiple commanders when present.

Files are rewritten only when their remote content changes, which keeps NAS snapshots and Git
histories quiet. `catalog.json` lists decks currently discovered in the configured folder;
previously downloaded deck folders remain available even after removal from that catalog.

## Development

```sh
deno task check
deno task test
deno task coverage
```

`deno task check` includes a fresh coverage run and terminal summary. The raw profiles and
HTML/LCOV-ready coverage output are kept in `coverage/`, which is ignored by Git.

## Releases and Docker image versions

`deno.json` is the single source of truth for the application version. Releases use
[Release Please](https://github.com/googleapis/release-please-action) and semantic versioning: patch
releases fix behavior, minor releases add compatible features, and major releases may require
configuration or workflow changes.

Do not manually run `deno bump-version`, commit a version change, or create a release tag. Release
Please examines Conventional Commits on `main`, opens and updates a release pull request containing
the `deno.json` version bump and generated release notes, and creates the GitHub Release and
`vMAJOR.MINOR.PATCH` tag when that pull request is merged.

The same workflow then verifies the tag matches `deno.json`, reruns the checks, and publishes
`ghcr.io/bassadin/tappedout-exporter` with these tags:

- Stable `v1.2.3`: `1.2.3`, `1.2`, `1`, `latest`, and an immutable `sha-…` tag.
- Prerelease `v1.2.3-rc.1`: `1.2.3-rc.1` and an immutable `sha-…` tag only.

Use a full version such as `ghcr.io/bassadin/tappedout-exporter:1.2.3` in a deployed Compose file;
reserve `latest` for intentionally following every stable release. The first GHCR package may need
to be made public in its GitHub package settings before it can be pulled anonymously.

### Conventional Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) for changes merged to `main`. This
is the input Release Please uses to create release pull requests, update `deno.json`, generate
release notes, create Git tags, and trigger the versioned GHCR image build.

| Commit form                                    | Release effect        | Example                                  |
| ---------------------------------------------- | --------------------- | ---------------------------------------- |
| `fix:`                                         | Patch                 | `fix: retry rate-limited deck downloads` |
| `feat:`                                        | Minor                 | `feat: export deck commander names`      |
| `type!:` or a `BREAKING CHANGE:` footer        | Major                 | `feat!: change the backup JSON schema`   |
| `docs:`, `test:`, `ci:`, `chore:`, `refactor:` | No release by default | `test: cover folder pagination`          |

Use a short imperative description after the type. Add an optional scope when it makes the change
clearer, such as `fix(backup): preserve metadata when CSV data is unchanged`.

Prefer pinned, actively maintained Deno standard-library or JSR packages for generic concerns such
as parsing, scheduling, validation, and protocol handling. Keep custom code focused on
TappedOut-specific behavior, and add a dependency only when its maintenance and security cost is
lower than owning the equivalent implementation.

This project is an independent backup client and is not affiliated with TappedOut.net or Wizards of
the Coast.
