import type {
  LibraryOpeningBody,
  LibraryPositionBody,
  OpeningLibraryBody,
  Problem,
} from '@pawnia/contracts'
import type { ApiClient } from './client'

/** The opening library from the API: openings to study, their lines, real games, traps. */
export class RemoteOpeningLibrary {
  private readonly api: ApiClient

  constructor(api: ApiClient) {
    this.api = api
  }

  async list(): Promise<OpeningLibraryBody> {
    const res = await this.api.api.v1['opening-library'].$get()
    if (res.status !== 200) throw new Error(await problemText(res))
    return (await res.json()) as OpeningLibraryBody
  }

  async opening(id: string): Promise<LibraryOpeningBody> {
    const res = await this.api.api.v1['opening-library'][':id'].$get({ param: { id } })
    if (res.status !== 200) throw new Error(await problemText(res))
    return (await res.json()) as LibraryOpeningBody
  }

  /** What real games played after these moves; null when the library has no games there. */
  async position(moves: readonly string[]): Promise<LibraryPositionBody | null> {
    const res = await this.api.api.v1['opening-library'].position.$get({
      query: { moves: moves.join(',') },
    })
    if (res.status === 404) return null
    if (res.status !== 200) throw new Error(await problemText(res))
    return (await res.json()) as LibraryPositionBody
  }
}

async function problemText(res: Response): Promise<string> {
  const problem = (await res.json().catch(() => ({}))) as Partial<Problem>
  return problem.detail ?? problem.title ?? `HTTP ${res.status}`
}
