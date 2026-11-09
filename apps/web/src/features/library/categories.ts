import type { GameCategory } from '@pawnia/library'

export { categoryOf, type GameCategory } from '@pawnia/library'

export const CATEGORY_LABELS: Record<GameCategory, string> = {
  chesscom: 'chess.com',
  lichess: 'lichess',
  bot: 'Bots',
  local: 'Local',
}
