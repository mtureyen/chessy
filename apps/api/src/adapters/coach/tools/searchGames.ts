import { defineTool, type CoachTool } from '@chessy/coach'
import type { PlayerGame } from '@chessy/history'
import { z } from 'zod'
import { filterFields, matchingGames, type HistoryAccess } from './historyFilter'

/** The user's games that match, newest first: to find the game they mean, or examples. */
export function searchGamesTool(access: HistoryAccess): CoachTool {
  return defineTool({
    name: 'search_games',
    description:
      'Finds the user\'s own games in their history (imported from chess.com and lichess, and played here), newest first, seen from the user\'s side. Use it to find a game they mention ("my last loss", "the game against X") or examples of something. Gives each game\'s id, date, opponent, result, opening and, if reviewed, accuracy. For totals and trends use stats instead.',
    input: z.object({
      ...filterFields,
      limit: z.number().int().min(1).max(20).default(10).describe('How many games to list.'),
    }),
    run: async ({ limit, ...filter }) => {
      const { games, note } = await matchingGames(access, filter)
      const result = {
        matching: games.length,
        games: games.slice(0, limit).map(describeGame),
        ...(note && { note }),
      }
      return { content: JSON.stringify(result) }
    },
  })
}

function describeGame({ game, category, side, outcome, rating, opponent }: PlayerGame) {
  const opponentSide = side === 'white' ? 'black' : 'white'
  return {
    id: game.id,
    date: game.playedAt.slice(0, 10),
    category,
    speed: game.speed,
    ...(game.timeControl && { timeControl: game.timeControl }),
    rated: game.rated,
    color: side,
    result: outcome,
    ...(rating !== undefined && { rating }),
    opponent: opponent.rating ? `${opponent.name} (${opponent.rating})` : opponent.name,
    ...(game.opening?.name && { opening: game.opening.name }),
    ...(game.accuracy && {
      accuracy: { user: game.accuracy[side], opponent: game.accuracy[opponentSide] },
    }),
    reviewed: game.reviewed,
    ...(game.url && { url: game.url }),
  }
}
