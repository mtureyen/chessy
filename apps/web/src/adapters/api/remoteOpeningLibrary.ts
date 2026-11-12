import type {
  LineNotesBody,
  LibraryOpeningBody,
  LibraryPositionBody,
  OpeningGuideBody,
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

  guide(id: string) {
    return openingGuide(this.api, id)
  }

  writeGuide(id: string, regenerate?: boolean) {
    return writeOpeningGuide(this.api, id, regenerate)
  }

  /** The coach's notes on one line of an opening; null when none are written yet. */
  async lineNotes(id: string, moves: readonly string[]): Promise<LineNotesBody | null> {
    const res = await this.api.api.v1['opening-library'][':id']['line-notes'].$get({
      param: { id },
      query: { moves: moves.join(',') },
    })
    if (res.status === 404) return null
    if (res.status !== 200) throw new Error(await problemText(res))
    return (await res.json()) as LineNotesBody
  }

  /** Has the coach write the notes on a line (or write them again). */
  async writeLineNotes(
    id: string,
    moves: readonly string[],
    regenerate = false,
  ): Promise<LineNotesBody> {
    const res = await this.api.api.v1['opening-library'][':id']['line-notes'].$post({
      param: { id },
      json: { moves: [...moves], ...(regenerate && { regenerate }) },
    })
    if (res.status !== 200) throw new Error(await problemText(res))
    return (await res.json()) as LineNotesBody
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

/** The coach's guide of an opening; null when none is written yet. */
export async function openingGuide(api: ApiClient, id: string): Promise<OpeningGuideBody | null> {
  const res = await api.api.v1['opening-library'][':id'].guide.$get({ param: { id } })
  if (res.status === 404) return null
  if (res.status !== 200) throw new Error(await problemText(res))
  return (await res.json()) as OpeningGuideBody
}

/** Has the coach write the guide (or write it again). */
export async function writeOpeningGuide(
  api: ApiClient,
  id: string,
  regenerate = false,
): Promise<OpeningGuideBody> {
  const res = await api.api.v1['opening-library'][':id'].guide.$post({
    param: { id },
    json: regenerate ? { regenerate } : {},
  })
  if (res.status !== 200) throw new Error(await problemText(res))
  return (await res.json()) as OpeningGuideBody
}

async function problemText(res: Response): Promise<string> {
  const problem = (await res.json().catch(() => ({}))) as Partial<Problem>
  return problem.detail ?? problem.title ?? `HTTP ${res.status}`
}
