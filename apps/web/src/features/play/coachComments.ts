const KEY = 'pawnia.coach-comments'

/** Whether the coach comments on the user's moves in bot games (per browser); off until asked. */
export function coachCommentsOn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function rememberCoachComments(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // Storage blocked: the choice still holds until the page is reloaded.
  }
}
