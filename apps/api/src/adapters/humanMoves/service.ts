import type { HumanMoveQuery } from '@chessy/analysis'
import { moveProbabilities, type MaiaModel } from '@chessy/maia'

export type HumanMovesStatus =
  { available: true; name: string } | { available: false; reason: string }

/** The server's human-move model, as the routes see it. */
export interface HumanMoveService {
  status(): Promise<HumanMovesStatus>
  moveProbabilities(queries: readonly HumanMoveQuery[]): Promise<number[]>
}

/**
 * Maia behind the API: loads the model on first use (a missing model is not an error, reviews
 * then judge brilliant moves without it) and runs one batch at a time on the single session.
 */
export class MaiaHumanMoveService implements HumanMoveService {
  private readonly load: () => Promise<MaiaModel>
  private readonly name: string
  private model: Promise<MaiaModel> | undefined
  private queue: Promise<unknown> = Promise.resolve()

  constructor(load: () => Promise<MaiaModel>, name = 'Maia-3') {
    this.load = load
    this.name = name
  }

  async status(): Promise<HumanMovesStatus> {
    try {
      await this.loaded()
      return { available: true, name: this.name }
    } catch (error) {
      return { available: false, reason: error instanceof Error ? error.message : String(error) }
    }
  }

  moveProbabilities(queries: readonly HumanMoveQuery[]): Promise<number[]> {
    const run = this.queue.then(async () => moveProbabilities(await this.loaded(), queries))
    this.queue = run.catch(() => undefined)
    return run
  }

  private loaded(): Promise<MaiaModel> {
    // A failed load is retried on the next request (e.g. after `bun run maia:fetch`).
    this.model ??= this.load().catch((error: unknown) => {
      this.model = undefined
      throw error
    })
    return this.model
  }
}
