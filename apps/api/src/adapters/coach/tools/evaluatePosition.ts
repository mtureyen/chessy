import type { Score } from '@chessy/analysis'
import { defineTool, type CoachTool } from '@chessy/coach'
import { createGame } from '@chessy/chess'
import { z } from 'zod'
import type { EngineService } from '../../engine/service'

/** Search per position: about a second on the native engine, deep enough to trust. */
const NODES = 1_500_000

/**
 * The engine's view of a position: its best lines in SAN with their evaluations, so the coach
 * states facts instead of calculating.
 */
export function evaluatePositionTool(engine: EngineService): CoachTool {
  return defineTool({
    name: 'evaluate_position',
    description:
      "Stockfish's evaluation of a chess position and its best lines. Use it for every claim about who stands better, which move is best, or what a move allows. Evaluations are from White's point of view, in pawns (+1.00 = White is a pawn up in value).",
    input: z.object({
      fen: z.string().describe('The position in FEN.'),
      lines: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe('How many best moves to show (1–5, default 3).'),
    }),
    run: async ({ fen, lines = 3 }) => {
      const position = createGame(fen) // throws on an invalid FEN; the model gets the message
      const status = await engine.status()
      if (!status.available) throw new Error(`no engine on this server (${status.reason})`)
      const [evaluation] = await engine.evaluate({ fens: [fen], nodes: NODES, multiPv: lines })
      const result = {
        sideToMove: position.turn(),
        depth: evaluation?.depth ?? 0,
        lines: (evaluation?.lines ?? []).map((line) => ({
          evaluation: describeScore(line.score),
          moves: sanLine(fen, line.pv.slice(0, 8)),
        })),
      }
      return { content: JSON.stringify(result) }
    },
  })
}

function describeScore(score: Score): string {
  if (score.type === 'mate') {
    return `${score.winner === 'white' ? 'White' : 'Black'} mates in ${score.moves}`
  }
  const pawns = score.value / 100
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`
}

/** UCI moves played out from `fen`, as SAN; stops at the first move that doesn't fit. */
function sanLine(fen: string, uci: readonly string[]): string {
  const game = createGame(fen)
  const san: string[] = []
  for (const move of uci) {
    const node = game.play(move)
    if (!node?.move) break
    san.push(node.move.san)
  }
  return san.join(' ')
}
