import { Link, useLocation } from '@tanstack/react-router'
import { useState } from 'react'
import { useProfile } from './useProfile'
import { dismissWelcome, profileKnown, welcomeDismissed } from './welcome'
import './ProfileChip.css'

/**
 * First start: invites the user to link their account, until they do or close it. Decided from
 * the first render on (not once the profile has loaded), so it doesn't push the page down while
 * the user is already on it, nor flash up for someone who has a profile.
 */
export function WelcomeBanner() {
  const profile = useProfile()
  const { pathname } = useLocation()
  const [dismissed, setDismissed] = useState(welcomeDismissed)
  const [known] = useState(profileKnown)
  if (known || profile.data || dismissed || pathname === '/welcome') return null
  return (
    <div className="welcome-banner" role="region" aria-label="Welcome">
      <span>
        Welcome! Link your chess.com or lichess account and pawnia will know which games are yours.
      </span>
      <Link to="/welcome" className="welcome-banner-action">
        Set up
      </Link>
      <button
        type="button"
        aria-label="Close"
        onClick={() => {
          dismissWelcome()
          setDismissed(true)
        }}
      >
        ×
      </button>
    </div>
  )
}
