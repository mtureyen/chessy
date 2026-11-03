import { afterEach, describe, expect, it } from 'vitest'
import { createApiClient } from '@/adapters/api/client'
import { RemoteHumanMoves } from './remoteHumanMoves'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** Routes the typed client's requests to a fake server. */
function serve(respond: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; body?: unknown }[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    const body = input instanceof Request ? await input.clone().text() : init?.body
    calls.push({ url, body: body ? JSON.parse(String(body)) : undefined })
    return respond(url, init)
  }) as typeof fetch
  return { api: createApiClient('http://api.test'), calls }
}

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

describe('RemoteHumanMoves', () => {
  it('uses the server model when it has one', async () => {
    const { api, calls } = serve((url) =>
      url.endsWith('/human-moves')
        ? json({ available: true, name: 'Maia-3' })
        : json({ probabilities: [0.42] }),
    )
    const model = await RemoteHumanMoves.describe(api)
    expect(model?.name).toBe('Maia-3')
    const query = { fen: START, move: 'e2e4', eloSelf: 1500, eloOppo: 1400 }
    expect(await model!.moveProbabilities([query])).toEqual([0.42])
    expect(calls.at(-1)).toEqual({
      url: 'http://api.test/api/v1/human-moves/probabilities',
      body: { queries: [query] },
    })
  })

  it('is undefined without a server model or server', async () => {
    expect(
      await RemoteHumanMoves.describe(serve(() => json({ available: false, reason: 'none' })).api),
    ).toBeUndefined()
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    expect(await RemoteHumanMoves.describe(createApiClient('http://api.test'))).toBeUndefined()
  })

  it('fails a request the server refuses, so the review goes on without it', async () => {
    const { api } = serve((url) =>
      url.endsWith('/human-moves') ? json({ available: true, name: 'Maia-3' }) : json({}, 503),
    )
    const model = await RemoteHumanMoves.describe(api)
    await expect(model!.moveProbabilities([])).rejects.toThrow(/503/)
  })
})
