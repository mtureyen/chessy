# Chessy

A free, AI-assisted chess platform: play, analyze, learn.

**Status:** Phase 0 done (rule-correct board, local play). Phase 1 (engine, analysis, import, review) in progress.

## Architecture

Modular monolith with hexagonal modules in a Bun + Turborepo monorepo.

```
apps/
  web/          React SPA (Vite, TanStack Router + Query): UI + browser adapters
  api/          Hono on Bun: HTTP API under /api/v1 + server adapters
packages/
  chess/        shared core: rules, move tree, PGN/FEN (pure)
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

## License

Chessy builds on GPL-3.0 libraries (chessops, chessground, Stockfish). If it is published, it will be licensed accordingly.
