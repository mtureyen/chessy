import { materialDiff, opposite } from './boardFacts'
import { replayMoves, type TacticLine } from './puzzle'

/**
 * Pawns the line must win before it counts as a tactic. On puzzles 1, 2 or 3 make no difference
 * to how often the themes are right, only to how many lines are kept: a puzzle is a tactic to
 * begin with. A game's mistakes are not, and there a line that ends one pawn up is often
 * pressure that cashes in moves later: a queen check that attacks king and bishop, wins neither
 * and picks up a pawn four moves on would count as a fork.
 */
export const MIN_GAIN = 2

/**
 * The tactic inside an engine line: the line up to the solver's move that banks what it wins.
 * Undefined if the line wins nothing tangible.
 *
 * A puzzle's solution stops once the win is in hand. An engine's line goes on for as many moves
 * as the search had, and in the ordinary play after the win the detectors find things that have
 * nothing to do with it (a quiet move, a later trade seen as a skewer). And a line that wins
 * nothing is no tactic at all, whatever patterns show up in it. So:
 *  - a line that ends in mate is kept whole;
 *  - otherwise it is cut at the first of the solver's moves that leaves them at least `minGain`
 *    pawns up on the starting position once the opponent has answered, so a piece that is simply
 *    taken back doesn't count;
 *  - while the solver's very next move takes or promotes and adds to that, again counted after
 *    the answer, the cut moves on with it: a check that wins a pawn and then the rook behind the
 *    king is one tactic, a pawn grabbed or a trade made afterwards is not part of it.
 * Material is measured against the position before the opponent's first move, so taking back
 * what that move took is no gain. A gain without an answer in the line is not counted: there is
 * no telling whether it stands.
 */
export function cutEngineLine(line: TacticLine, minGain = MIN_GAIN): TacticLine | undefined {
  const replayed = replayMoves(line)
  if (!replayed) return undefined
  const { start, nodes } = replayed
  const pov = opposite(start.turn)
  const before = materialDiff(start, pov)
  const upTo = (index: number): TacticLine => ({
    fen: line.fen,
    moves: line.moves.slice(0, index + 1),
  })

  for (let index = 1; index < nodes.length; index += 2) {
    if (nodes[index]!.after.isCheckmate()) return upTo(index)
  }

  let cut: number | undefined
  let banked = 0
  for (let index = 1; index + 1 < nodes.length; index += 2) {
    const node = nodes[index]!
    const gain = materialDiff(nodes[index + 1]!.after, pov) - before
    if (cut === undefined) {
      if (gain < minGain) continue
    } else if (!(node.isCapture || node.promotion) || gain <= banked) {
      break
    }
    cut = index
    banked = gain
  }
  return cut === undefined ? undefined : upTo(cut)
}
