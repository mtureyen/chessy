import type { OpeningBody, OpeningsBody, Problem } from '@pawnia/contracts'
import type { ApiClient } from './client'

export type OpeningsSpeed = 'bullet' | 'blitz' | 'rapid' | 'classical'

export interface OpeningsQuery {
  last: number
  speed?: OpeningsSpeed
}

/** The user's openings from the API, for training them. */
export class RemoteOpenings {
  private readonly api: ApiClient

  constructor(api: ApiClient) {
    this.api = api
  }

  async list({ last, speed }: OpeningsQuery): Promise<OpeningsBody> {
    const res = await this.api.api.v1.training.openings.$get({
      query: { last: String(last), ...(speed && { speed }) },
    })
    if (res.status !== 200) throw new Error(await problemText(res))
    return (await res.json()) as OpeningsBody
  }

  async one(
    color: 'white' | 'black',
    family: string,
    { last, speed }: OpeningsQuery,
  ): Promise<OpeningBody> {
    const res = await this.api.api.v1.training.openings[':color'].$get({
      param: { color },
      query: { family, last: String(last), ...(speed && { speed }) },
    })
    if (res.status !== 200) throw new Error(await problemText(res))
    return (await res.json()) as OpeningBody
  }
}

async function problemText(res: Response): Promise<string> {
  const problem = (await res.json().catch(() => ({}))) as Partial<Problem>
  return problem.detail ?? problem.title ?? `HTTP ${res.status}`
}
