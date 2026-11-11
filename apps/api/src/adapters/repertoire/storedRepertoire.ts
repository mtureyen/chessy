import { createGame } from '@pawnia/chess'
import type { AddRepertoireLineBody, RepertoireLineBody } from '@pawnia/contracts'
import { afterReview, newLine, reviewDue, type ReviewProgress } from '@pawnia/history'
import type { StoredRepertoireLine } from '../db/repertoireStore'
import { IllegalLineError, type RepertoireService } from './repertoireService'

/** Where the repertoire is kept: the server's database. */
export interface RepertoireLibrary {
  repertoireLines(): Promise<StoredRepertoireLine[]>
  repertoireLine(id: string): Promise<StoredRepertoireLine | undefined>
  addRepertoireLine(line: StoredRepertoireLine): Promise<StoredRepertoireLine>
  removeRepertoireLine(id: string): Promise<boolean>
  saveRepertoireProgress(id: string, progress: ReviewProgress): Promise<void>
}

/** The user's repertoire in the database, with each line's place in its reviews. */
export class StoredRepertoire implements RepertoireService {
  private readonly library: RepertoireLibrary
  private readonly now: () => Date
  private readonly newId: () => string

  constructor(
    library: RepertoireLibrary,
    now: () => Date = () => new Date(),
    newId: () => string = () => crypto.randomUUID(),
  ) {
    this.library = library
    this.now = now
    this.newId = newId
  }

  async list(): Promise<RepertoireLineBody[]> {
    const now = this.now()
    return (await this.library.repertoireLines()).map((line) => this.body(line, now))
  }

  async add({ side, title, moves, openingId, source }: AddRepertoireLineBody) {
    // The moves as the rules write them, so the same line is kept once.
    const game = createGame()
    const sans = moves.map((move) => {
      const san = game.play(move)?.move?.san
      if (!san) throw new IllegalLineError(move)
      return san
    })
    const now = this.now()
    const kept = await this.library.addRepertoireLine({
      id: this.newId(),
      side,
      title,
      moves: sans,
      ...(openingId && { openingId }),
      source: source ?? 'library',
      ...newLine(now),
      addedAt: now.toISOString(),
    })
    return this.body(kept, now)
  }

  remove(id: string): Promise<boolean> {
    return this.library.removeRepertoireLine(id)
  }

  async review(id: string, passed: boolean): Promise<RepertoireLineBody | undefined> {
    const line = await this.library.repertoireLine(id)
    if (!line) return undefined
    const now = this.now()
    const progress = afterReview(line, passed, now)
    await this.library.saveRepertoireProgress(id, progress)
    return this.body({ ...line, ...progress }, now)
  }

  private body(line: StoredRepertoireLine, now: Date): RepertoireLineBody {
    const due = reviewDue(line, now)
    return { ...line, due: due.due, ...(!due.due && { inDays: due.inDays }) }
  }
}
