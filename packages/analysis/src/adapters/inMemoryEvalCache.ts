import type { PositionEval } from '../domain/review/types'
import type { EvalCache } from '../ports/evalCache'

export class InMemoryEvalCache implements EvalCache {
  private readonly entries = new Map<string, PositionEval>()

  async get(key: string): Promise<PositionEval | undefined> {
    const value = this.entries.get(key)
    return value && structuredClone(value)
  }

  async put(key: string, value: PositionEval): Promise<void> {
    this.entries.set(key, structuredClone(value))
  }

  get size(): number {
    return this.entries.size
  }
}
