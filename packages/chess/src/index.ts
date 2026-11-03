/** Shared core: chess rules, move tree and PGN/FEN. Pure, no I/O. */
export * from './domain/types'
export { mostExposedPiece, staticExchange } from './domain/exchange'
export { hasInsufficientMaterial, materialBalance } from './domain/material'
export { createGame, InvalidPositionError, type GameState } from './domain/game'
export {
  exportPgn,
  importPgn,
  PgnImportError,
  type ImportedGame,
  type PgnHeaders,
} from './domain/pgn'
