import type { AddRepertoireLineBody, Problem, RepertoireLineBody } from '@pawnia/contracts'
import type { ApiClient } from './client'

/** The user's repertoire on the server: lines to keep, reviewed with growing gaps. */
export class RemoteRepertoire {
  private readonly api: ApiClient

  constructor(api: ApiClient) {
    this.api = api
  }

  async list(): Promise<RepertoireLineBody[]> {
    const res = await this.api.api.v1.repertoire.$get()
    if (res.status !== 200) throw new Error(await problemText(res))
    return ((await res.json()) as { lines: RepertoireLineBody[] }).lines
  }

  async add(line: AddRepertoireLineBody): Promise<RepertoireLineBody> {
    const res = await this.api.api.v1.repertoire.$post({ json: line })
    if (res.status !== 200) throw new Error(await problemText(res))
    return ((await res.json()) as { line: RepertoireLineBody }).line
  }

  async remove(id: string): Promise<void> {
    const res = await this.api.api.v1.repertoire[':id'].$delete({ param: { id } })
    if (res.status !== 200) throw new Error(await problemText(res))
  }

  async review(id: string, passed: boolean): Promise<RepertoireLineBody> {
    const res = await this.api.api.v1.repertoire[':id'].reviews.$post({
      param: { id },
      json: { passed },
    })
    if (res.status !== 200) throw new Error(await problemText(res))
    return ((await res.json()) as { line: RepertoireLineBody }).line
  }
}

async function problemText(res: Response): Promise<string> {
  const problem = (await res.json().catch(() => ({}))) as Partial<Problem>
  return problem.detail ?? problem.title ?? `HTTP ${res.status}`
}
