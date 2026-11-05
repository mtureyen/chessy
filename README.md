# Chessy

A free, AI-assisted chess platform: play, analyze, learn.

**Status:** local play, bots in eight levels (with clocks), analysis board with Stockfish, game import from lichess and chess.com, and game review with accuracy and move classification.

## Architecture

Modular monolith with hexagonal modules in a Bun + Turborepo monorepo.

```
apps/
  web/          React SPA (Vite, TanStack Router + Query): UI + browser adapters
  extension/    browser extension: "Open in Chessy" on lichess / chess.com game pages
  api/          Hono on Bun: HTTP API under /api/v1 + server adapters
packages/
  chess/        shared core: rules, move tree, PGN/FEN (pure)
  analysis/     engine port (UCI), evaluations, game review (accuracy, move classes)
  library/      the user's games: import from lichess / chess.com, storage port
  history/      finished games and reviews kept for the long run (the server's copy)
  coach/        the AI coach: provider-neutral model port, tools, tool loop, conversations
  play/         games against bots: levels, move choice, saving finished games
  maia/         Maia-3: which move a human of a given rating would play (runtime-neutral)
  contracts/    API contract (zod + OpenAPI), shared by api and web
  config/       shared TypeScript config
```

Each context package is layered `domain/` → `ports/` → `usecases/` and exposes only `src/index.ts`.
The rules are enforced in CI by dependency-cruiser (`.dependency-cruiser.cjs`).

## Stack

TypeScript · React + Vite · TanStack Router/Query · Hono + zod-openapi · PostgreSQL + Drizzle · [chessops](https://github.com/niklasf/chessops) · [chessground](https://github.com/lichess-org/chessground) · Vitest · Playwright · Bun · Turborepo

## Development

```sh
bun install
bun dev                    # web on http://localhost:5173, api on http://localhost:3000
bun run check              # lint, format, boundaries, typecheck, tests, build
bun run test               # unit + API tests
bun run e2e                # Playwright (starts both apps if not running)
bun run check:boundaries   # architecture rules
```

API docs: http://localhost:3000/api/v1/docs (OpenAPI: `/api/v1/openapi.json`)

### Game history (optional, PostgreSQL)

The app keeps your games in the browser and works without a server. With a database, the API
also keeps a copy of every saved game and finished review; the browser sends it whatever it
lacks on start. Later features (the coach, statistics) build on that copy.

```sh
docker compose up -d db                     # PostgreSQL 17 on localhost:5433
cp apps/api/.env.example apps/api/.env      # DATABASE_URL for it
```

The schema is applied on start (migrations in `apps/api/drizzle/`, changes via
`bun run --cwd apps/api db:generate`). `DATABASE_URL=pglite:<folder>` runs an embedded Postgres
instead, without Docker; tests and E2E use `pglite:memory`. `bun run --cwd apps/api db:check`
checks the adapters against a real PostgreSQL (as CI does).

### AI coach

The coach answers questions about positions and games. It states only what its tools return
(engine evaluations for now), so it doesn't make up lines. Behind it are interchangeable
`LlmClient`s (`packages/coach`), one tool loop for all of them, and the API's agents:

- **Claude through the API**: put `ANTHROPIC_API_KEY` into `apps/api/.env`; `COACH_CLAUDE_MODEL`
  (default `claude-opus-5-5`) and `COACH_CLAUDE_EFFORT` (default `medium`) tune it.
- **A local model in [Ollama](https://ollama.com)**: `COACH_OLLAMA=on`, `COACH_OLLAMA_MODEL`
  (default `qwen3:14b`; it needs a model that can call tools). Start Ollama with a larger context,
  `OLLAMA_CONTEXT_LENGTH=16384 ollama serve`: its default is a few thousand tokens, and a longer
  conversation would be cut off at the start without an error.
- **Any other OpenAI-compatible API** (OpenAI, OpenRouter, Groq, LM Studio, …): `COACH_OPENAI_URL`,
  `COACH_OPENAI_MODEL`, `COACH_OPENAI_KEY`.

`bun run --cwd apps/api coach:check [ollama|openai-compatible]` asks a real question and shows the answer, the tools it
used and the tokens it cost.

### Native engine (optional, much faster reviews)

Game reviews run on Stockfish in the browser (WASM) by default. With a native Stockfish on the
API server they run on all cores instead (several single-threaded processes in parallel):

```sh
bun run engine:native   # downloads the official Stockfish build (pinned, checksum-verified)
```

Or point `STOCKFISH_PATH` at any Stockfish binary (e.g. from Homebrew). `ENGINE_POOL_SIZE` sets
the number of parallel processes (default: cores − 2, at most 8). Without a native engine the
API reports so and the browser reviews on its own.

### Bot calibration

`bun run bots:calibrate` plays the bot levels against each other and against Stockfish set to
fixed `UCI_Elo` values, then estimates a rating per level (shown as "~1400" when picking a bot).
The bots run on the browser's engine under Node, the reference engine natively, so it needs
`node` and `bun run engine:native`. A full run takes about half an hour; see the script for
options.

Levels 1–6 play human-like when the API has the Maia model (below): they sample from what a
player of a set rating would play. `--human-levels` measures them that way, and
`--human rating:temperature:top-p,…` adds players with other settings, to find the ones that hit
a level's rating. Maia runs on the script's single thread, so `--shard i/n` splits a run across
several processes; `--refit` fits their result files together.

### Maia (human-like moves)

[Maia-3](https://github.com/CSSLab/maia3) predicts the move a human of a given rating would play.
`bun run --cwd apps/api maia:fetch` downloads the model the official Maia platform serves to
browsers (pinned, checksum-verified); `bun run --cwd apps/api maia:spike latency | match
<games.json> | strength` measures its speed, how often it predicts real moves, and its strength
against the bot levels.

### Browser extension ("Open in Chessy")

On lichess, chess.com and Chessigma game pages the extension shows an "Open in Chessy" button.
It reads only the page address; Chessy then fetches the game through the platforms' public
APIs (chess.com: among your own games, so set your chess.com username under Games first) and
opens it on the analysis board (`/open?url=…`).

```sh
bun run --cwd apps/extension build   # → apps/extension/dist
```

In Chrome: `chrome://extensions` → Developer mode → Load unpacked → `apps/extension/dist`.
The Chessy address (default `http://localhost:5173`) is set in the extension's options.

### Reference labels

`bun run --cwd apps/api bench:references <chess.com username>... [--games 20]` reviews those
players' recent games on Chessigma (Stockfish in the browser, chess.com-like move labels) in a
normal Chrome window and saves every move's label to `apps/api/.bench/references.json`. One game
at a time with pauses; Chessigma itself runs one review per browser at a time.
`bun run --cwd apps/api review:bench --references apps/api/.bench/references.json` then compares
our classes with them, move by move.

### Review benchmark

`bun run --cwd apps/api review:bench <dataset.json>` runs the game review over games where
chess.com marked a move brilliant (e.g. Chessigma's published brilliant benchmark, not part of
this repo) and reports how many we find and how many other moves we call brilliant. Engine and
Maia results are cached in `apps/api/.bench/`, so after the first run a rule change is measured
in seconds. Even games are for tuning, odd ones for checking (`--split tune|check`).

## Contributing

Branch, commit and PR conventions: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Chessy is licensed under the [GNU Affero General Public License v3.0](LICENSE). It builds on
GPL-3.0 libraries (chessops, chessground, Stockfish) and on Maia-3 by the University of Toronto
Computational Social Science Lab (AGPL-3.0).

The board's piece sets come from lichess under their own licences (GPL, AGPL, Apache 2.0, MIT,
CC BY 4.0, CC0); authors and licences are listed in
[apps/web/public/pieces/README.md](apps/web/public/pieces/README.md).
