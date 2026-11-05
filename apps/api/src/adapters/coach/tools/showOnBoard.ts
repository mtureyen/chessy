import { defineTool, type CoachTool, type DrawColor } from '@chessy/coach'
import { createGame } from '@chessy/chess'
import { z } from 'zod'

const Square = z
  .string()
  .regex(/^[a-h][1-8]$/, 'a square like e4')
  .describe('A square, e.g. "e4".')
const Color = z
  .enum(['green', 'red', 'blue', 'yellow'] satisfies DrawColor[])
  .describe(
    'green: good moves and plans, red: threats and mistakes, blue: alternatives, yellow: things to notice.',
  )

/** Arrows and squares on the user's board, so "this move" and "that square" can be seen. */
export function showOnBoardTool(): CoachTool {
  return defineTool({
    name: 'show_on_board',
    description:
      "Draws arrows and coloured squares on the user's board, to point at moves, threats, weak squares or plans you explain. Draws on the position on the user's board, or on `fen` to show another position (e.g. a moment from their game). A new call replaces the previous drawing. Draw only what your answer talks about.",
    input: z
      .object({
        arrows: z
          .array(z.object({ from: Square, to: Square, color: Color.default('green') }))
          .max(8)
          .default([]),
        squares: z
          .array(z.object({ square: Square, color: Color.default('yellow') }))
          .max(16)
          .default([]),
        fen: z
          .string()
          .optional()
          .describe('The position to show; the one on the board if left out.'),
      })
      .refine((input) => input.arrows.length + input.squares.length > 0, 'nothing to draw')
      .refine((input) => input.arrows.every((a) => a.from !== a.to), 'an arrow needs two squares'),
    run: async ({ arrows, squares, fen }) => {
      if (fen) createGame(fen) // throws on an invalid FEN; the model gets the message
      const what = [
        arrows.length > 0 && `${arrows.length} arrow${arrows.length > 1 ? 's' : ''}`,
        squares.length > 0 && `${squares.length} square${squares.length > 1 ? 's' : ''}`,
      ].filter(Boolean)
      return {
        content: `Shown to the user: ${what.join(' and ')}${fen ? ' on the given position' : ''}.`,
        board: { arrows, squares, ...(fen && { fen }) },
      }
    },
  })
}
