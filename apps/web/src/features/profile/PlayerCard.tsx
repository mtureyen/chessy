import { sourceName, type PlayerProfile, type RatedSpeed } from '@chessy/library'
import { flagEmoji } from './flag'

const SPEED_LABELS: Record<RatedSpeed, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
  correspondence: 'Daily',
}

/** A platform account at a glance: avatar, name, country and ratings. */
export function PlayerCard({ player }: { player: PlayerProfile }) {
  const flag = flagEmoji(player.country)
  const ratings = (Object.keys(SPEED_LABELS) as RatedSpeed[]).filter(
    (speed) => player.ratings[speed] !== undefined,
  )
  return (
    <div className="player-card" data-testid={`player-${player.source}`}>
      {player.avatarUrl ? (
        <img className="player-card-avatar" src={player.avatarUrl} alt="" />
      ) : (
        <span className="player-card-avatar player-card-initial" aria-hidden>
          {player.username[0]?.toUpperCase()}
        </span>
      )}
      <div className="player-card-text">
        <a className="player-card-name" href={player.url} target="_blank" rel="noreferrer">
          {player.title && <span className="player-card-title">{player.title}</span>}
          {player.username}
          {flag && <span aria-label={player.country}> {flag}</span>}
        </a>
        <span className="player-card-source">
          {sourceName(player.source)}
          {player.name && ` · ${player.name}`}
        </span>
        <span className="player-card-ratings">
          {ratings.length === 0
            ? 'No rated games yet'
            : ratings.map((speed) => `${SPEED_LABELS[speed]} ${player.ratings[speed]}`).join(' · ')}
        </span>
      </div>
    </div>
  )
}
