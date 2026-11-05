import type { CoachTool } from '@chessy/coach'
import type { EngineService } from '../../engine/service'
import type { HumanMoveService } from '../../humanMoves/service'
import { evaluatePositionTool } from './evaluatePosition'
import type { HistoryAccess } from './historyFilter'
import { humanMovesTool } from './humanMoves'
import { searchGamesTool } from './searchGames'
import { showOnBoardTool } from './showOnBoard'
import { statsTool } from './stats'

/** Every tool the coach has, on this server's engine, human-move model and history. */
export function createCoachTools({
  engine,
  humanMoves,
  history,
}: {
  engine: EngineService
  humanMoves: HumanMoveService
  history: HistoryAccess
}): CoachTool[] {
  return [
    evaluatePositionTool(engine),
    humanMovesTool(humanMoves),
    searchGamesTool(history),
    statsTool(history),
    showOnBoardTool(),
  ]
}
