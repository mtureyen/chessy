import { LOCAL_PLAYER_NAME, type LibraryGame } from '@chessy/library'

/** The kinds of games the list keeps apart. */
export type GameCategory = 'chesscom' | 'lichess' | 'bot' | 'local'

export const CATEGORY_LABELS: Record<GameCategory, string> = {
  chesscom: 'chess.com',
  lichess: 'lichess',
  bot: 'Bots',
  local: 'Local',
}

/** Games played here are against a bot when "You" played, else two people on one board. */
export function categoryOf(game: Pick<LibraryGame, 'source' | 'white' | 'black'>): GameCategory {
  if (game.source !== 'chessy') return game.source
  return game.white.name === LOCAL_PLAYER_NAME || game.black.name === LOCAL_PLAYER_NAME
    ? 'bot'
    : 'local'
}
