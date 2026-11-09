import type { LibraryGame } from '@pawnia/library'
import { CATEGORY_LABELS, categoryOf, type GameCategory } from './categories'

export type GameFilter = GameCategory | 'all'

const ORDER: readonly GameFilter[] = ['all', 'chesscom', 'lichess', 'bot', 'local']

/** All · chess.com · lichess · Bots · Local, each with how many games it holds. */
export function GameTabs({
  games,
  value,
  onChange,
}: {
  games: readonly LibraryGame[]
  value: GameFilter
  onChange: (filter: GameFilter) => void
}) {
  const counts: Record<GameFilter, number> = {
    all: games.length,
    chesscom: 0,
    lichess: 0,
    bot: 0,
    local: 0,
  }
  for (const game of games) counts[categoryOf(game)]++
  return (
    <div className="game-tabs" role="tablist" aria-label="Games">
      {ORDER.map((filter) => (
        <button
          key={filter}
          type="button"
          role="tab"
          aria-selected={value === filter}
          onClick={() => onChange(filter)}
        >
          {filter === 'all' ? 'All' : CATEGORY_LABELS[filter]}
          <span className="game-tab-count">{counts[filter]}</span>
        </button>
      ))}
    </div>
  )
}
