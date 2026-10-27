/** Platforms we import games from. */
export type SourceId = 'lichess' | 'chesscom'

export const SOURCE_IDS: readonly SourceId[] = ['lichess', 'chesscom']

export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*'

export type Speed = 'ultrabullet' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'correspondence'

export interface PlayerInfo {
  name: string
  rating?: number
}

/** A game as a platform reports it. The PGN is the source of truth; the rest is for listing. */
export interface SourceGame {
  source: SourceId
  /** The platform's own id (lichess game id, chess.com game uuid). */
  externalId: string
  url: string
  pgn: string
  white: PlayerInfo
  black: PlayerInfo
  result: GameResult
  speed: Speed
  /** e.g. "180+2"; omitted for correspondence games. */
  timeControl?: string
  rated: boolean
  /** ISO timestamp of when the game was played (end time if that's all we know). */
  playedAt: string
  opening?: { eco?: string; name?: string }
}

/** A game stored in the user's library. */
export interface LibraryGame extends SourceGame {
  /** Our own stable id (UUID); (source, externalId) stays unique as well. */
  id: string
  importedAt: string
}

export type Outcome = 'win' | 'loss' | 'draw' | 'unknown'

/** The game's outcome from `username`'s point of view (case-insensitive); 'unknown' if they didn't play. */
export function outcomeFor(game: SourceGame, username: string): Outcome {
  const name = username.toLowerCase()
  const side =
    game.white.name.toLowerCase() === name
      ? 'white'
      : game.black.name.toLowerCase() === name
        ? 'black'
        : undefined
  if (!side || game.result === '*') return 'unknown'
  if (game.result === '1/2-1/2') return 'draw'
  return (game.result === '1-0') === (side === 'white') ? 'win' : 'loss'
}

/** Usernames on lichess and chess.com: 2–30 letters, digits, `_` or `-`. */
export function isValidUsername(username: string): boolean {
  return /^[A-Za-z0-9_-]{2,30}$/.test(username)
}
