import {
  filterGames,
  playerGames,
  type GameFilter,
  type GameHistory,
  type PlayerGame,
} from '@chessy/history'
import type { Profile } from '@chessy/library'
import { z } from 'zod'

/** What the history tools read: the stored games and whose they are. */
export interface HistoryAccess {
  history: GameHistory
  profile: () => Promise<Profile | undefined>
}

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a date like 2026-10-31')

/** The filter both history tools take, as the model writes it. */
export const filterFields = {
  category: z
    .enum(['chesscom', 'lichess', 'bot', 'local'])
    .optional()
    .describe('chess.com, lichess, against Chessy bots, or two players on one board here.'),
  color: z.enum(['white', 'black']).optional().describe('The colour the user played.'),
  outcome: z
    .enum(['win', 'loss', 'draw', 'unfinished'])
    .optional()
    .describe("From the user's side."),
  opponent: z.string().min(1).optional().describe("Part of the opponent's name."),
  opening: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Part of the opening name (e.g. "Sicilian"), or an ECO code or its start (e.g. "B2").',
    ),
  speed: z
    .enum(['ultrabullet', 'bullet', 'blitz', 'rapid', 'classical', 'correspondence', 'unlimited'])
    .optional(),
  rated: z.boolean().optional(),
  reviewed: z.boolean().optional().describe('Only games with (or without) a review.'),
  since: Day.optional().describe('First day, YYYY-MM-DD.'),
  until: Day.optional().describe('Last day, YYYY-MM-DD.'),
  lastGames: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe('Only the newest this many games that match: how the user plays now.'),
}

/** The user's games that match, newest first, and a note when it isn't clear which are theirs. */
export async function matchingGames(
  { history, profile }: HistoryAccess,
  filter: GameFilter,
): Promise<{ games: PlayerGame[]; note?: string }> {
  const [summaries, owner] = await Promise.all([history.summaries(), profile()])
  const games = filterGames(playerGames(summaries, owner), filter)
  if (owner) return { games }
  return {
    games,
    note: 'No profile is set up, so only games played here count as the user’s; they can add their chess.com or lichess name on the profile page.',
  }
}
