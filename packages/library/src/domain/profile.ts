import { InvalidUsernameError } from './errors'
import { isValidUsername, LOCAL_PLAYER_NAME, type LibraryGame, type SourceId } from './game'

/** One of the user's own platform accounts. */
export interface LinkedAccount {
  source: SourceId
  /** As the platform spells it. */
  username: string
}

/**
 * Who uses pawnia here: a name and their accounts, no password. The app finds their games and
 * their side in them through it. One per installation for now.
 */
export interface Profile {
  id: string
  displayName: string
  accounts: LinkedAccount[]
  /** ISO timestamps. */
  createdAt: string
  updatedAt: string
}

/**
 * A profile from what the user entered: at most one account per platform, valid usernames, and
 * a display name (defaults to the first account's username). Throws InvalidUsernameError.
 */
export function buildProfile(
  input: { displayName?: string; accounts: LinkedAccount[] },
  { id, now, createdAt }: { id: string; now: string; createdAt?: string },
): Profile {
  const accounts: LinkedAccount[] = []
  for (const account of input.accounts) {
    const username = account.username.trim()
    if (!isValidUsername(username)) throw new InvalidUsernameError(username)
    if (accounts.some((a) => a.source === account.source)) continue
    accounts.push({ source: account.source, username })
  }
  const displayName = input.displayName?.trim() || accounts[0]?.username || LOCAL_PLAYER_NAME
  return { id, displayName, accounts, createdAt: createdAt ?? now, updatedAt: now }
}

/** The user's account on a platform, if they linked one. */
export function accountOn(profile: Profile, source: SourceId): LinkedAccount | undefined {
  return profile.accounts.find((account) => account.source === source)
}

/** Which side the user played in a game: by account name, or "You" in games played here. */
export function sideOf(
  profile: Profile,
  game: Pick<LibraryGame, 'source' | 'white' | 'black'>,
): 'white' | 'black' | undefined {
  const name =
    game.source === 'chessy' ? LOCAL_PLAYER_NAME : accountOn(profile, game.source)?.username
  if (!name) return undefined
  const lower = name.toLowerCase()
  if (game.white.name.toLowerCase() === lower) return 'white'
  if (game.black.name.toLowerCase() === lower) return 'black'
  return undefined
}
