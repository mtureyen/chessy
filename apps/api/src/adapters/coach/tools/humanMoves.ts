import { defineTool, type CoachTool } from '@chessy/coach'
import { createGame } from '@chessy/chess'
import { z } from 'zod'
import type { HumanMoveService } from '../../humanMoves/service'

/** The rating a question is answered for when neither the model nor the user gave one. */
const DEFAULT_RATING = 1500

/**
 * What people of a rating play in a position (Maia), so the coach can tell a natural move from
 * one nobody finds, and the trap people fall into from the line the engine likes.
 */
export function humanMovesTool(humanMoves: HumanMoveService): CoachTool {
  return defineTool({
    name: 'human_moves',
    description:
      "What players of a given rating would most likely play in a position, with probabilities (the Maia model, trained on millions of human games). Use it to say whether a move is natural or hard to find at the player's level, or which tempting mistake people make here. It says what humans play, not what is good: check with evaluate_position.",
    input: z.object({
      fen: z.string().describe('The position in FEN.'),
      rating: z
        .number()
        .int()
        .min(100)
        .max(3500)
        .optional()
        .describe("Rating of the side to move; the user's rating if left out."),
      moves: z
        .number()
        .int()
        .min(1)
        .max(10)
        .default(5)
        .describe('How many of the likeliest moves to list.'),
    }),
    run: async ({ fen, rating, moves }, context) => {
      createGame(fen) // throws on an invalid FEN; the model gets the message
      const status = await humanMoves.status()
      if (!status.available)
        throw new Error(`no human-move model on this server (${status.reason})`)
      const elo = rating ?? context.rating ?? DEFAULT_RATING
      const prediction = await humanMoves.predict({ fen, eloSelf: elo })
      const result = {
        rating: elo,
        ...(rating === undefined &&
          context.rating === undefined && {
            note: "The user's rating is unknown; this is for 1500.",
          }),
        moves: prediction.moves.slice(0, moves).map(({ move, probability }) => ({
          move: san(fen, move),
          probability: `${Math.round(probability * 100)}%`,
        })),
        expectedScore: `${Math.round(prediction.expectedScore * 100)}% for the side to move (how such games tend to end from here, not an engine evaluation)`,
      }
      return { content: JSON.stringify(result) }
    },
  })
}

function san(fen: string, uci: string): string {
  return createGame(fen).play(uci)?.move?.san ?? uci
}
