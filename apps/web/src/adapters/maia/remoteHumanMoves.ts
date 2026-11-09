import type { HumanMoveModel, HumanMoveQuery } from '@pawnia/analysis'
import type { HumanMovePredictionBody, HumanMovesStatusBody } from '@pawnia/contracts'
import type { HumanMoveDistribution, HumanMovePolicy, HumanMoveRequest } from '@pawnia/play'
import type { ApiClient } from '@/adapters/api/client'

/**
 * The API's Maia, for the review (HumanMoveModel) and human-like bots (HumanMovePolicy).
 * `describe` tells whether the server has one.
 */
export class RemoteHumanMoves implements HumanMoveModel, HumanMovePolicy {
  readonly name: string
  private readonly api: ApiClient

  private constructor(api: ApiClient, name: string) {
    this.api = api
    this.name = name
  }

  /** The server's model, or undefined if it has none or can't be reached. */
  static async describe(api: ApiClient): Promise<RemoteHumanMoves | undefined> {
    try {
      const status = (await (await api.api.v1['human-moves'].$get()).json()) as HumanMovesStatusBody
      return status.available ? new RemoteHumanMoves(api, status.name) : undefined
    } catch {
      return undefined
    }
  }

  async moveProbabilities(queries: readonly HumanMoveQuery[]): Promise<number[]> {
    const res = await this.api.api.v1['human-moves'].probabilities.$post({
      json: { queries: [...queries] },
    })
    if (res.status !== 200) throw new Error(`Human-move model failed: HTTP ${res.status}`)
    const { probabilities } = (await res.json()) as { probabilities: number[] }
    return probabilities
  }

  async predict(request: HumanMoveRequest): Promise<HumanMoveDistribution> {
    const res = await this.api.api.v1['human-moves'].predict.$post({ json: request })
    if (res.status !== 200) throw new Error(`Human-move model failed: HTTP ${res.status}`)
    return (await res.json()) as HumanMovePredictionBody
  }
}
