import type { EvalCache, PositionEval } from '@chessy/analysis'
import type { ChessyDb } from './db'

export class DexieEvalCache implements EvalCache {
  private readonly db: ChessyDb

  constructor(db: ChessyDb) {
    this.db = db
  }

  async get(key: string): Promise<PositionEval | undefined> {
    return (await this.db.evals.get(key))?.value
  }

  async put(key: string, value: PositionEval): Promise<void> {
    await this.db.evals.put({ key, value })
  }
}
