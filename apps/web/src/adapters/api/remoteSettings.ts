import type {
  CoachAgentsBody,
  CoachSettingsBody,
  CoachSettingsUpdateBody,
  Problem,
} from '@pawnia/contracts'
import type { ApiClient } from './client'

/** The API's settings (only answered from this machine) and its coach agents. */
export class RemoteSettings {
  private readonly api: ApiClient

  constructor(api: ApiClient) {
    this.api = api
  }

  async coach(): Promise<CoachSettingsBody> {
    const res = await this.api.api.v1.settings.coach.$get()
    if (res.status !== 200) throw new Error(await problemText(res))
    return (await res.json()) as CoachSettingsBody
  }

  async updateCoach(update: CoachSettingsUpdateBody): Promise<CoachSettingsBody> {
    const res = await this.api.api.v1.settings.coach.$put({ json: update })
    if (res.status !== 200) throw new Error(await problemText(res))
    return (await res.json()) as CoachSettingsBody
  }

  /** The coach's agents now, the default first, each with whether it can answer. */
  async agents(): Promise<CoachAgentsBody['agents']> {
    const res = await this.api.api.v1.coach.$get()
    return ((await res.json()) as CoachAgentsBody).agents
  }
}

async function problemText(res: Response): Promise<string> {
  try {
    const problem = (await res.json()) as Problem & { errors?: { path: string; message: string }[] }
    const first = problem.errors?.[0]
    return first ? `${first.path}: ${first.message}` : (problem.detail ?? problem.title)
  } catch {
    return `HTTP ${res.status}`
  }
}
