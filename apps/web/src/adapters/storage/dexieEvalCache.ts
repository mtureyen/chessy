import type { EvalCache, PositionEval } from '@pawnia/analysis'
import type { PawniaDb } from './db'

export class DexieEvalCache implements EvalCache {
  private readonly db: PawniaDb

  constructor(db: PawniaDb) {
    this.db = db
  }

  async get(key: string): Promise<PositionEval | undefined> {
    return (await this.db.evals.get(key))?.value
  }

  async put(key: string, value: PositionEval): Promise<void> {
    await this.db.evals.put({ key, value })
  }
}
