# Chessy

A free, AI-assisted chess platform: play, analyze, learn.

**Status:** local play, bots in eight levels (with clocks), analysis board with Stockfish, game import from lichess and chess.com, and game review with accuracy and move classification.

## Architecture

Modular monolith with hexagonal modules in a Bun + Turborepo monorepo.

```
apps/
  web/          React SPA (Vite, TanStack Router + Query): UI + browser adapters
  api/          Hono on Bun: HTTP API under /api/v1 + server adapters
packages/
  chess/        shared core: rules, move tree, PGN/FEN (pure)
  analysis/     engine port (UCI), evaluations, game review (accuracy, move classes)
  library/      the user's games: import from lichess / chess.com, storage port
  play/         games against bots: levels, move choice, saving finished games
  maia/         Maia-3: which move a human of a given rating would play (runtime-neutral)
  contracts/    API contract (zod + OpenAPI), shared by api and web
  config/       shared TypeScript config
```

Each context package is layered `domain/` → `ports/` → `usecases/` and exposes only `src/index.ts`.
The rules are enforced in CI by dependency-cruiser (`.dependency-cruiser.cjs`).

## Stack

TypeScript · React + Vite · TanStack Router/Query · Hono + zod-openapi · [chessops](https://github.com/niklasf/chessops) · [chessground](https://github.com/lichess-org/chessground) · Vitest · Playwright · Bun · Turborepo

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

### Maia (human-like moves, prototype)

[Maia-3](https://github.com/CSSLab/maia3) predicts the move a human of a given rating would play.
`bun run --cwd apps/api maia:fetch` downloads the model the official Maia platform serves to
browsers (pinned, checksum-verified); `bun run --cwd apps/api maia:spike latency | match
<games.json> | strength` measures its speed, how often it predicts real moves, and its strength
against the bot levels.

## Contributing

Branch, commit and PR conventions: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Chessy is licensed under the [GNU Affero General Public License v3.0](LICENSE). It builds on
GPL-3.0 libraries (chessops, chessground, Stockfish) and on Maia-3 by the University of Toronto
Computational Social Science Lab (AGPL-3.0).
