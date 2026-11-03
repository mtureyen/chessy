const KEY = 'chessy.welcome-dismissed'
const HAS_PROFILE = 'chessy.has-profile'

/** Whether the user closed the "set up your profile" banner (per browser). */
export function welcomeDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function dismissWelcome(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Storage blocked: the banner just comes back next time.
  }
}

/**
 * Whether this browser has seen a profile: known before the profile itself has loaded, so the
 * banner can be left out from the first render on.
 */
export function profileKnown(): boolean {
  try {
    return localStorage.getItem(HAS_PROFILE) === '1'
  } catch {
    return false
  }
}

export function rememberProfile(): void {
  try {
    localStorage.setItem(HAS_PROFILE, '1')
  } catch {
    // Storage blocked: the banner waits for the profile to load instead.
  }
}
