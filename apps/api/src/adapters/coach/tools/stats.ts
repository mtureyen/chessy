import { defineTool, type CoachTool } from '@chessy/coach'
import { groupGames, moveQuality, ratingTrends, tally } from '@chessy/history'
import { z } from 'zod'
import { filterFields, matchingGames, type HistoryAccess } from './historyFilter'

/** At most this many groups and rating series, so an answer stays readable for the model. */
const MAX_GROUPS = 15
const MAX_TRENDS = 6

/** Totals over the user's history: results, groups, rating trends, errors by phase. */
export function statsTool(access: HistoryAccess): CoachTool {
  return defineTool({
    name: 'stats',
    description:
      "Statistics over the user's own games (all, or those matching the filter), from the user's side: wins/draws/losses and score, optionally grouped (by opening family, colour, speed, platform, month, or opponent strength), their rating over time per platform and speed, and from reviewed games their accuracy and errors (inaccuracies, mistakes, misses, blunders) by phase. Use it for questions about strengths, weaknesses and progress. Move quality covers only reviewed games: say how many that is.",
    input: z.object({
      ...filterFields,
      groupBy: z
        .enum(['opening', 'color', 'speed', 'category', 'month', 'opponent_strength'])
        .optional()
        .describe('Split the results into groups.'),
    }),
    run: async ({ groupBy, ...filter }) => {
      const [{ games, note }, moves] = await Promise.all([
        matchingGames(access, filter),
        access.history.reviewedMoves(),
      ])
      const quality = moveQuality(games, moves)
      const groups = groupBy && groupGames(games, groupBy)
      const result = {
        results: tally(games),
        ...(groups && {
          groupedBy: groupBy,
          groups: groups.slice(0, MAX_GROUPS),
          ...(groups.length > MAX_GROUPS && { moreGroups: groups.length - MAX_GROUPS }),
        }),
        ratings: ratingTrends(games).slice(0, MAX_TRENDS),
        moveQuality:
          quality.reviewedGames > 0
            ? { ...quality, coverage: `${quality.reviewedGames} of ${games.length} games reviewed` }
            : `None of these ${games.length} games is reviewed yet, so nothing about move quality.`,
        ...(note && { note }),
      }
      return { content: JSON.stringify(result) }
    },
  })
}
