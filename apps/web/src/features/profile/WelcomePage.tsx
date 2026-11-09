import type { LinkedAccount, Profile, SourceId } from '@pawnia/library'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { AccountField } from './AccountField'
import { dismissWelcome } from './welcome'
import { useProfile, useSaveProfile } from './useProfile'
import './Profile.css'

/** chess.com first: most players have an account there. */
const PLATFORMS: readonly SourceId[] = ['chesscom', 'lichess']

/**
 * /welcome: set up (or edit) the profile: the user's chess.com / lichess accounts, confirmed by
 * their public profiles. No password: it tells pawnia whose games these are.
 */
export function WelcomePage() {
  const profile = useProfile()
  if (profile.isPending) return null
  return <ProfileForm existing={profile.data ?? undefined} />
}

function ProfileForm({ existing }: { existing?: Profile }) {
  const [accounts, setAccounts] = useState<Partial<Record<SourceId, string>>>(() =>
    Object.fromEntries((existing?.accounts ?? []).map((a) => [a.source, a.username])),
  )
  const [displayName, setDisplayName] = useState(existing?.displayName ?? '')
  const save = useSaveProfile()
  const navigate = useNavigate()
  const linked: LinkedAccount[] = PLATFORMS.flatMap((source) => {
    const username = accounts[source]
    return username ? [{ source, username }] : []
  })
  const ready = linked.length > 0 || displayName.trim() !== ''

  return (
    <form
      className="profile-page welcome"
      onSubmit={(e) => {
        e.preventDefault()
        if (!ready || save.isPending) return
        save.mutate(
          { displayName, accounts: linked },
          { onSuccess: () => void navigate({ to: '/profile' }) },
        )
      }}
    >
      <h1>{existing ? 'Edit your profile' : 'Welcome to pawnia'}</h1>
      <p className="profile-intro">
        {existing
          ? 'Your accounts and the name pawnia calls you.'
          : 'Link your chess.com or lichess account, so pawnia knows which games are yours and which side you played. No password: your games are public on those sites anyway.'}
      </p>

      {PLATFORMS.map((source) => (
        <AccountField
          key={source}
          source={source}
          initial={accounts[source] ?? ''}
          onChange={(username) => setAccounts((all) => ({ ...all, [source]: username }))}
        />
      ))}

      <div className="account-field">
        <label htmlFor="display-name">Your name in pawnia</label>
        <input
          id="display-name"
          placeholder={linked[0]?.username ?? 'e.g. Alex'}
          value={displayName}
          maxLength={50}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>

      {save.isError && (
        <p className="message message-error" role="alert">
          {save.error.message}
        </p>
      )}
      <div className="profile-actions">
        <button type="submit" className="profile-save" disabled={!ready || save.isPending}>
          {existing ? 'Save' : 'Set up my profile'}
        </button>
        {!existing && (
          <Link to="/" onClick={dismissWelcome}>
            Skip for now
          </Link>
        )}
      </div>
    </form>
  )
}
