import type { GameReview, ReviewInput } from '@pawnia/analysis'
import type { CoachTool } from '@pawnia/coach'
import type { GameHistory, GameLine, StoredReview } from '@pawnia/history'
import type { LibraryGame, Profile } from '@pawnia/library'
import type { EngineService } from '../../engine/service'
import type { HumanMoveService } from '../../humanMoves/service'
import { evaluatePositionTool } from './evaluatePosition'
import { gameReviewTool } from './gameReview'
import { humanMovesTool } from './humanMoves'
import { searchGamesTool } from './searchGames'
import { showOnBoardTool } from './showOnBoard'
import { statsTool } from './stats'

/** The game history as the coach's tools read it (the server's database). */
export interface CoachLibrary extends GameHistory {
  game(id: string): Promise<LibraryGame | undefined>
  profile(): Promise<Profile | undefined>
  findReview(line: GameLine): Promise<StoredReview | undefined>
  saveReview(review: StoredReview): Promise<void>
}

/** Every tool the coach has, on this server's engine, human-move model, history and reviewer. */
export function createCoachTools({
  engine,
  humanMoves,
  library,
  review,
}: {
  engine: EngineService
  humanMoves: HumanMoveService
  library: CoachLibrary
  /** Reviews a game on this server. */
  review: (input: ReviewInput) => Promise<GameReview>
}): CoachTool[] {
  const history = { history: library, profile: () => library.profile() }
  return [
    evaluatePositionTool(engine),
    humanMovesTool(humanMoves),
    searchGamesTool(history),
    statsTool(history),
    gameReviewTool({
      game: (id) => library.game(id),
      profile: () => library.profile(),
      reviews: {
        // Without a database the game on the board is still reviewed, just not kept.
        reviews: {
          find: (line) => library.findReview(line).catch(() => undefined),
          save: (stored) => library.saveReview(stored).catch(() => undefined),
        },
        review,
        now: () => new Date(),
      },
    }),
    showOnBoardTool(),
  ]
}
