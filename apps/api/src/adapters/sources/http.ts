import { SourceUnavailableError, UserNotFoundError, type SourceId } from '@chessy/library'

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export interface HttpSourceOptions {
  fetch?: Fetch
  userAgent: string
}

/** GET with the platform's error conventions mapped to library errors. */
export async function get(
  source: SourceId,
  url: string,
  username: string,
  { fetch: doFetch = fetch, userAgent }: HttpSourceOptions,
  accept = 'application/json',
): Promise<Response> {
  let res: Response
  try {
    res = await doFetch(url, { headers: { Accept: accept, 'User-Agent': userAgent } })
  } catch (error) {
    throw new SourceUnavailableError(
      source,
      `network error: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (res.status === 404) throw new UserNotFoundError(source, username)
  if (res.status === 429) {
    // lichess asks clients to wait a full minute after a 429.
    const retryAfter = Number(res.headers.get('Retry-After')) || 60
    throw new SourceUnavailableError(source, 'rate limited', retryAfter)
  }
  if (!res.ok) throw new SourceUnavailableError(source, `HTTP ${res.status}`)
  return res
}

/** Reads a tag like `[Result "1-0"]` from a PGN. */
export function pgnTag(pgn: string, name: string): string | undefined {
  return new RegExp(`^\\[${name} "([^"]*)"\\]\\s*$`, 'm').exec(pgn)?.[1]
}

export function pgnResult(pgn: string): '1-0' | '0-1' | '1/2-1/2' | '*' {
  const result = pgnTag(pgn, 'Result')
  return result === '1-0' || result === '0-1' || result === '1/2-1/2' ? result : '*'
}
