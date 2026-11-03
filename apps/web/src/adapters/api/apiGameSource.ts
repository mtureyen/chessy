import {
  GameNotFoundError,
  InvalidUsernameError,
  SourceUnavailableError,
  UserNotFoundError,
  type GameSource,
  type SourceGame,
  type SourceId,
} from '@chessy/library'
import type { ApiClient } from './client'

/** GameSource in the browser: asks our API, which talks to the platform (and caches/queues). */
export class ApiGameSource implements GameSource {
  readonly id: SourceId
  private readonly api: ApiClient

  constructor(id: SourceId, api: ApiClient) {
    this.id = id
    this.api = api
  }

  async recentGames(username: string, { max }: { max: number }): Promise<SourceGame[]> {
    let res
    try {
      res = await this.api.api.v1.sources[':source'].users[':username'].games.$get({
        param: { source: this.id, username },
        query: { max: String(max) },
      })
    } catch (error) {
      throw new SourceUnavailableError(this.id, `Chessy API unreachable: ${String(error)}`)
    }
    if (res.status === 200) return (await res.json()).games
    if (res.status === 404) throw new UserNotFoundError(this.id, username)
    if (res.status === 400) throw new InvalidUsernameError(username)
    if (res.status === 429) {
      throw new SourceUnavailableError(
        this.id,
        'rate limited',
        Number(res.headers.get('Retry-After')) || 60,
      )
    }
    throw new SourceUnavailableError(this.id, `HTTP ${res.status}`)
  }

  async game(id: string, { username }: { username?: string }): Promise<SourceGame> {
    let res
    try {
      res = await this.api.api.v1.sources[':source'].games[':id'].$get({
        param: { source: this.id, id },
        query: username ? { username } : {},
      })
    } catch (error) {
      throw new SourceUnavailableError(this.id, `Chessy API unreachable: ${String(error)}`)
    }
    if (res.status === 200) return (await res.json()).game
    if (res.status === 404) {
      const { detail } = (await res.json()) as { detail?: string }
      throw new GameNotFoundError(this.id, id, detail)
    }
    if (res.status === 400) throw new GameNotFoundError(this.id, id, 'not a valid game id')
    if (res.status === 429) {
      throw new SourceUnavailableError(
        this.id,
        'rate limited',
        Number(res.headers.get('Retry-After')) || 60,
      )
    }
    throw new SourceUnavailableError(this.id, `HTTP ${res.status}`)
  }
}
