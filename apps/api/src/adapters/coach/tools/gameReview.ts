import { formatSanLine, keyMoments, toSanLine, type ReviewedMove } from '@chessy/analysis'
import { defineTool, type CoachTool } from '@chessy/coach'
import { importPgn, type Color } from '@chessy/chess'
import { ensureReview, gameLine, type EnsureReviewDeps } from '@chessy/history'
import { LOCAL_PLAYER_NAME, type LibraryGame, type Profile } from '@chessy/library'
import { z } from 'zod'

/** What game_review reads and writes: stored games, the profile, reviews (stored or new). */
export interface GameReviewAccess {
  game(id: string): Promise<LibraryGame | undefined>
  profile(): Promise<Profile | undefined>
  reviews: EnsureReviewDeps
}

/** At most this many key moments, so a long game stays readable for the model. */
const MAX_MOMENTS = 20
/** Moves of the engine's line shown for a key moment. */
const LINE_MOVES = 6

/**
 * A game's review (stored, or made now on the server's engine and kept): accuracy, how many moves
 * of each class, and the moments that decided it, each with the position before it, so the coach
 * can look closer and show it on the board.
 */
export function gameReviewTool(access: GameReviewAccess): CoachTool {
  return defineTool({
    name: 'game_review',
    description:
      "The review of a game: each side's accuracy, how many moves of each class (best, mistake, blunder, …), and the key moments (brilliant and great moves, misses, mistakes, blunders) with the move, how the mover's winning chances changed, the engine's better move and line, and the position before it (FEN). Without gameId it reviews the game on the user's board; with an id from search_games, that game. A game never reviewed before is reviewed now, which takes a few seconds. Give ply for one move in detail instead.",
    input: z.object({
      gameId: z.string().min(1).optional().describe("A game's id from search_games."),
      ply: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("One move in detail: its half-move number (1 = White's first move)."),
    }),
    run: async ({ gameId, ply }, context) => {
      const game = gameId ? await access.game(gameId) : undefined
      if (gameId && !game) throw new Error(`no game with id ${gameId}; find one with search_games`)
      const pgn = game?.pgn ?? context.pgn
      if (!pgn) {
        throw new Error('no game on the board; pass a gameId from search_games')
      }
      const { headers } = importPgn(pgn)
      const line = gameLine(pgn)
      if (line.moves.length === 0) throw new Error('the game has no moves yet')
      const players = {
        white: {
          name: game?.white.name ?? headers.White ?? '?',
          rating: game?.white.rating ?? elo(headers.WhiteElo),
        },
        black: {
          name: game?.black.name ?? headers.Black ?? '?',
          rating: game?.black.rating ?? elo(headers.BlackElo),
        },
      }
      const ratings = {
        ...(players.white.rating && { white: players.white.rating }),
        ...(players.black.rating && { black: players.black.rating }),
      }

      const started = Date.now()
      const { stored, fresh } = await ensureReview(access.reviews, { ...line, ratings })
      const { review } = stored
      const userColor = userSide(await access.profile().catch(() => undefined), players)

      const header = {
        white: label(players.white),
        black: label(players.black),
        result: game?.result ?? headers.Result ?? '*',
        ...(game && { date: game.playedAt.slice(0, 10) }),
        ...(userColor && { userColor }),
        reviewed: fresh
          ? `just now (${Math.round((Date.now() - started) / 1000)} s)`
          : `on ${stored.reviewedAt.slice(0, 10)}`,
        engine: `${review.settings.engine}, ${review.settings.nodes} nodes per position`,
      }
      if (ply !== undefined) {
        const move = review.moves.find((m) => m.ply === ply)
        if (!move) throw new Error(`the game has no move ${ply} (it has ${review.moves.length})`)
        const detail = {
          ...describeMove(move, review.positions[ply - 1]?.fen),
          fenAfter: review.positions[ply]?.fen,
          accuracy: Math.round(move.accuracy),
          facts: move.facts,
        }
        return { content: JSON.stringify({ game: header, move: detail }) }
      }
      const moments = keyMoments(review)
      const result = {
        game: header,
        accuracy: review.accuracy,
        counts: review.counts,
        keyMoments: moments
          .slice(0, MAX_MOMENTS)
          .map((move) => describeMove(move, review.positions[move.ply - 1]?.fen)),
        ...(moments.length > MAX_MOMENTS && {
          moreKeyMoments: `${moments.length - MAX_MOMENTS} more; ask for a ply to see one`,
        }),
      }
      return { content: JSON.stringify(result) }
    },
  })
}

function describeMove(move: ReviewedMove, fenBefore: string | undefined) {
  const line =
    fenBefore && move.best && formatSanLine(toSanLine(fenBefore, move.best.line, LINE_MOVES))
  return {
    ply: move.ply,
    move: `${move.moveNumber}${move.color === 'white' ? '.' : '...'} ${move.san}`,
    color: move.color,
    class: move.classification,
    winningChances: `${Math.round(move.winBefore)}% → ${Math.round(move.winAfter)}%`,
    ...(move.best &&
      move.best.uci !== move.uci && {
        better: {
          move: move.best.san,
          ...(line && { line }),
        },
      }),
    ...(fenBefore && { fenBefore }),
  }
}

function elo(tag: string | undefined): number | undefined {
  const value = Number(tag)
  return Number.isInteger(value) && value > 0 ? value : undefined
}

function label({ name, rating }: { name: string; rating?: number | undefined }): string {
  return rating ? `${name} (${rating})` : name
}

/** The user's colour in the game, by their account names or "You" in games played here. */
function userSide(
  profile: Profile | undefined,
  players: Record<Color, { name: string }>,
): Color | undefined {
  const names = [LOCAL_PLAYER_NAME, ...(profile?.accounts.map((a) => a.username) ?? [])].map((n) =>
    n.toLowerCase(),
  )
  if (names.includes(players.white.name.toLowerCase())) return 'white'
  if (names.includes(players.black.name.toLowerCase())) return 'black'
  return undefined
}
