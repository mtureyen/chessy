import { Link } from '@tanstack/react-router'
import { usePlayer, useProfile } from './useProfile'
import './ProfileChip.css'

/** Header: the user's avatar and name, or a link to set up a profile. */
export function ProfileChip() {
  const profile = useProfile()
  const chesscom = profile.data?.accounts.find((a) => a.source === 'chesscom')
  const player = usePlayer('chesscom', chesscom?.username)
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
    </Link>
  )
}
