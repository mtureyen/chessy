import {
  outcomeFor,
  sourceName,
  type LibraryGame,
  type PlayerInfo,
  type SourceId,
} from '@chessy/library'
import { Link } from '@tanstack/react-router'
import { formatTimeControl, SPEED_LABELS } from './format'

interface GameListProps {
  games: LibraryGame[]
  /** The user's own accounts; their games get a win/loss/draw badge and their name is highlighted. */
  usernames: Partial<Record<SourceId, string>>
  onDelete: (id: string) => void
}

const OUTCOME_LABELS = { win: 'Won', loss: 'Lost', draw: 'Draw' } as const

export function GameList({ games, usernames, onDelete }: GameListProps) {
  if (games.length === 0) {
    return (
      <p className="game-list-empty">
        No games yet. Import your recent games from lichess or chess.com.
      </p>
    )
  }
  return (
    <ul className="game-list">
      {games.map((game) => {
        const me = usernames[game.source]
        const outcome = me ? outcomeFor(game, me) : 'unknown'
        return (
          <li key={game.id} className="game-row" data-testid="game-row">
            <span className={`game-outcome game-outcome-${outcome}`}>
              {outcome === 'unknown' ? game.result.replace('1/2', '½') : OUTCOME_LABELS[outcome]}
            </span>
            <div className="game-main">
              <Link to="/analysis" search={{ game: game.id }} className="game-players">
                <Player player={game.white} color="white" me={me} />
                <span className="game-vs">vs</span>
                <Player player={game.black} color="black" me={me} />
              </Link>
              <div className="game-meta">
                {[
                  `${SPEED_LABELS[game.speed]}${game.timeControl ? ` ${formatTimeControl(game.timeControl)}` : ''}`,
                  game.rated ? 'Rated' : 'Casual',
                  new Date(game.playedAt).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  }),
                  game.opening?.name,
                  sourceName(game.source),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <div className="game-actions">
              <Link to="/analysis" search={{ game: game.id }} className="button">
                Analyse
              </Link>
              <a
                href={game.url}
                target="_blank"
                rel="noreferrer"
                className="button"
                title={`Open on ${sourceName(game.source)}`}
              >
                ↗
              </a>
              <button
                type="button"
                aria-label="Delete game"
                title="Delete from library"
                onClick={() => onDelete(game.id)}
              >
                ✕
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function Player({
  player,
  color,
  me,
}: {
  player: PlayerInfo
  color: 'white' | 'black'
  me: string | undefined
}) {
  const isMe = me !== undefined && player.name.toLowerCase() === me.toLowerCase()
  return (
    <span className={`game-player${isMe ? ' game-player-me' : ''}`}>
      <span className={`player-dot player-dot-${color}`} aria-hidden />
      {player.name}
      {player.rating !== undefined && <span className="game-rating"> ({player.rating})</span>}
    </span>
  )
}
