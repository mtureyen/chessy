import type {
  EvaluateOptions,
  EvaluationRequest,
  EvaluatorInfo,
  PositionEval,
  PositionEvaluator,
} from '@chessy/analysis'

export type EngineStatus =
  ({ available: true } & EvaluatorInfo) | { available: false; reason: string }

/** The server's evaluation service, as the routes see it. */
export interface EngineService {
  status(): Promise<EngineStatus>
  evaluate(request: EvaluationRequest, options?: EvaluateOptions): Promise<PositionEval[]>
}

/**
 * Wraps an evaluator for the API: reports availability (a missing binary is not an error, the
 * browser then reviews on its own) and runs one batch at a time, because a pool's engines can
 * only serve one caller.
 */
export class SerialEngineService implements EngineService {
  private readonly evaluator: PositionEvaluator
  private queue: Promise<unknown> = Promise.resolve()

  constructor(evaluator: PositionEvaluator) {
    this.evaluator = evaluator
  }

  async status(): Promise<EngineStatus> {
    try {
      return { available: true, ...(await this.evaluator.describe()) }
    } catch (error) {
      return { available: false, reason: error instanceof Error ? error.message : String(error) }
    }
  }

  evaluate(request: EvaluationRequest, options?: EvaluateOptions): Promise<PositionEval[]> {
    const run = this.queue.then(() => this.evaluator.evaluate(request, options))
    this.queue = run.catch(() => undefined)
    return run
  }
}
