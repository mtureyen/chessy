import { Link } from '@tanstack/react-router'
import { useRunningImport } from './historyImport'
import { usePlayer, useProfile } from './useProfile'
import './ProfileChip.css'

/** Header: the user's avatar and name, or a link to set up a profile. */
export function ProfileChip() {
  const profile = useProfile()
  const chesscom = profile.data?.accounts.find((a) => a.source === 'chesscom')
  const player = usePlayer('chesscom', chesscom?.username)
  const importing = useRunningImport()
  if (profile.isPending) return null
  if (!profile.data) {
    return (
      <Link to="/welcome" className="profile-chip profile-chip-setup">
        Set up profile
      </Link>
    )
  }
  const { displayName } = profile.data
  return (
    <Link to="/profile" className="profile-chip" aria-label={`Profile: ${displayName}`}>
      {player.data?.avatarUrl ? (
        <img src={player.data.avatarUrl} alt="" />
      ) : (
        <span className="profile-chip-initial" aria-hidden>
          {displayName[0]?.toUpperCase()}
        </span>
      )}
      <span className="profile-chip-name">{displayName}</span>
      {importing && (
        <span className="profile-chip-import" title="Importing your games">
          ↓{' '}
          {importing.progress.total
            ? `${importing.progress.done}/${importing.progress.total}`
            : importing.fetched}
        </span>
      )}
    </Link>
  )
}
