import type { GameCategory } from '@chessy/library'

export { categoryOf, type GameCategory } from '@chessy/library'

export const CATEGORY_LABELS: Record<GameCategory, string> = {
  chesscom: 'chess.com',
  lichess: 'lichess',
  bot: 'Bots',
  local: 'Local',
}
