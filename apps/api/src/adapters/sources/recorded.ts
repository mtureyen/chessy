import { readFileSync } from 'node:fs'
import type { Fetch } from './http'

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

/** Usernames with recorded data; any other user is "not found". */
export const RECORDED_USERS = { lichess: 'DrNykterstein', chesscom: 'hikaru' } as const

/**
 * A fetch that answers from recorded real responses instead of the network.
 * Used by tests and by `CHESSY_SOURCES=recorded` (E2E, offline development).
 */
export const recordedFetch: Fetch = async (url) => {
  const { pathname } = new URL(url)
  const lichessUser = /^\/api\/games\/user\/([^/]+)$/.exec(pathname)?.[1]
  if (lichessUser) {
    return lichessUser.toLowerCase() === RECORDED_USERS.lichess.toLowerCase()
      ? new Response(fixture('lichess-games.ndjson'), {
          headers: { 'Content-Type': 'application/x-ndjson' },
        })
      : new Response('{"error":"Not found"}', { status: 404 })
  }
  const chesscom = /^\/pub\/player\/([^/]+)\/games\/(archives|\d{4}\/\d{2})$/.exec(pathname)
  if (chesscom && chesscom[1] === RECORDED_USERS.chesscom) {
    const file =
      chesscom[2] === 'archives'
        ? 'chesscom-archives.json'
        : `chesscom-${chesscom[2]!.replace('/', '-')}.json`
    return Response.json(JSON.parse(fixture(file)))
  }
  if (chesscom) return Response.json({ code: 0, message: 'User not found.' }, { status: 404 })
  return new Response('not recorded', { status: 500 })
}
