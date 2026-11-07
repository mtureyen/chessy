import { sourceName, type LinkedAccount } from '@chessy/library'
import { Link } from '@tanstack/react-router'
import { ImportStatus } from './ImportStatus'
import { PlayerCard } from './PlayerCard'
import { RecentReview } from './RecentReview'
import { usePlayer, useProfile } from './useProfile'
import './Profile.css'

/** /profile: who the user is in pawnia and their linked accounts. */
export function ProfilePage() {
  const profile = useProfile()
  if (profile.isPending) return null
  if (!profile.data) {
    return (
      <div className="profile-page">
        <h1>No profile yet</h1>
        <p className="profile-intro">
          Link your chess.com or lichess account so pawnia knows your games.
        </p>
        <Link className="profile-save" to="/welcome">
          Set up my profile
        </Link>
      </div>
    )
  }
  const { displayName, accounts, createdAt } = profile.data
  return (
    <div className="profile-page">
      <h1>{displayName}</h1>
      <p className="profile-intro">In pawnia since {new Date(createdAt).toLocaleDateString()}</p>
      <h2>Accounts</h2>
      {accounts.length === 0 && <p className="message message-info">No accounts linked.</p>}
      {accounts.map((account) => (
        <LinkedAccountCard key={account.source} account={account} />
      ))}
      <RecentReview />
      <div className="profile-actions">
        <Link className="profile-edit" to="/welcome">
          Edit profile
        </Link>
      </div>
    </div>
  )
}

function LinkedAccountCard({ account }: { account: LinkedAccount }) {
  const player = usePlayer(account.source, account.username)
  return (
    <div className="linked-account">
      {player.data ? (
        <PlayerCard player={player.data} />
      ) : (
        <p className="message message-info">
          {sourceName(account.source)}: {account.username}
          {player.isError && ' (could not be loaded right now)'}
        </p>
      )}
      <ImportStatus account={account} />
    </div>
  )
}
