# Chessy

A free, AI-assisted chess platform: play, analyze, learn.

**Status:** Phase 0, a rule-correct board for local two-player games.

## Stack

TypeScript · React + Vite · [chessops](https://github.com/niklasf/chessops) (rules) · [chessground](https://github.com/lichess-org/chessground) (board) · Vitest · Bun

## Development

```sh
bun install
bun dev          # http://localhost:5173
bun run test     # unit tests (rules, PGN, perft)
bun run lint
bun run typecheck
bun run format
```

## Layout

- `src/core/`: rules core, no UI dependencies (`GameState`, PGN/FEN)
- `src/ui/`: React components (board, promotion picker, move list)

## License

Chessy builds on GPL-3.0 libraries (chessops, chessground). If it is published, it will be licensed accordingly.
