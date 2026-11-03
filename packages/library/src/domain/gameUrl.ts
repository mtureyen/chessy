import type { SourceId } from './game'

/** A game on a platform, as its page URL names it. */
export interface GameReference {
  source: SourceId
  /** lichess: the 8-character game id; chess.com: the game number in the URL. */
  id: string
}

/**
 * Which platform game a page URL shows: lichess (lichess.org/<id>, also with the player's
 * 12-character id or /white, /black), chess.com (/game/live|daily/<n>, /analysis/game/…), and
 * Chessigma's imports of those (/import/chesscom/game/live/<n>, /import/lichess/<id>).
 * Undefined for anything else.
 */
export function parseGameUrl(url: string): GameReference | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  const host = parsed.hostname.replace(/^www\./, '')
  const path = parsed.pathname.replace(/\/+$/, '')

  if (host === 'lichess.org' || host.endsWith('.lichess.org')) {
    const id = /^\/([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{4})?(?:\/(?:white|black))?$/.exec(path)?.[1]
    // Game ids are random letters and digits; pages like /analysis or /training are words.
    return id && !/^[a-z]+$/.test(id) ? { source: 'lichess', id } : undefined
  }
  if (host === 'chess.com') {
    const id = /^\/(?:analysis\/)?game\/(?:live\/|daily\/)?(\d+)(?:\/.*)?$/.exec(path)?.[1]
    return id ? { source: 'chesscom', id } : undefined
  }
  if (host === 'chessigma.com') {
    const chesscom = /^\/import\/chesscom\/game\/(?:live|daily)\/(\d+)$/.exec(path)?.[1]
    if (chesscom) return { source: 'chesscom', id: chesscom }
    const lichess = /^\/import\/lichess\/([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{4})?$/.exec(path)?.[1]
    if (lichess) return { source: 'lichess', id: lichess }
  }
  return undefined
}
