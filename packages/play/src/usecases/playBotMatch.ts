import {
  EngineFailedError,
  whiteWinChance,
  type EngineProvider,
  type SearchLimits,
} from '@chessy/analysis'
import { createGame, exportPgn, type Color } from '@chessy/chess'
import type { GameResult } from '@chessy/library'
import { adjudicate } from '../domain/adjudication'
import type { BotLevel } from '../domain/levels'
import { seededRandom } from '../domain/random'
import { resultOf } from '../domain/session'
import { chooseBotMove } from './chooseBotMove'

/** Anything that can play a move in a match. */
export interface MatchPlayer {
  name: string
  /** The move (UCI) and, if known, White's winning chance (percent) as the player sees it. */
  move(fen: string): Promise<{ move: string; whiteWinChance?: number }>
}

export interface MatchGame {
  white: string
  black: string
  result: Exclude<GameResult, '*'>
  /** How it ended: on the board, or called early (see ADJUDICATION in domain/adjudication). */
  ending: 'board' | 'adjudicated' | 'move-limit'
  plies: number
  pgn: string
}

/** Our bot at a level, playing exactly as in a real game (fresh searches, seeded choice). */
export function botPlayer(engine: EngineProvider, level: BotLevel, seed: number): MatchPlayer {
  const random = seededRandom(seed)
  return {
    name: `level-${level.level}`,
    async move(fen) {
      const choice = await chooseBotMove({ engine }, { fen, level, random })
      const best = choice.candidates[0]
      const turn: Color = fen.split(' ')[1] === 'b' ? 'black' : 'white'
      return {
        move: choice.move,
        ...(best && { whiteWinChance: turn === 'white' ? best.winChance : 100 - best.winChance }),
      }
    },
  }
}

/** A plain engine searching with fixed limits, e.g. Stockfish set to a UCI_Elo as a reference. */
export function enginePlayer(
  name: string,
  engine: EngineProvider,
  limits: SearchLimits,
): MatchPlayer {
  return {
    name,
    async move(fen) {
      const snapshot = await engine.analyze({ fen, ...limits, fresh: true }).result
      if (snapshot.end === 'error') throw new EngineFailedError(snapshot.error ?? 'Engine failed')
      const move = snapshot.bestMove ?? snapshot.lines[0]?.pv[0]
      if (!move) throw new EngineFailedError(`${name} returned no move`)
      const score = snapshot.lines[0]?.score
      return { move, ...(score && { whiteWinChance: whiteWinChance(score) }) }
    },
  }
}

/**
 * Plays one game from the opening's moves until mate or draw, or until it is clearly decided
 * (ADJUDICATION). Throws when a player returns an illegal move.
 */
export async function playBotMatch(
  players: { white: MatchPlayer; black: MatchPlayer },
  opening: readonly string[] = [],
): Promise<MatchGame> {
  const game = createGame()
  for (const move of opening) {
    if (!game.play(move)) throw new Error(`Illegal opening move ${move}`)
  }
  const whiteWinChances: number[] = []
  let ending: MatchGame['ending'] = 'board'
  let adjudicated: Exclude<GameResult, '*'> | undefined

  while (game.status().kind === 'ongoing') {
    const player = players[game.turn()]
    const { move, whiteWinChance } = await player.move(game.fen())
    if (!game.play(move)) throw new Error(`${player.name} played an illegal move: ${move}`)
    if (whiteWinChance !== undefined) whiteWinChances.push(whiteWinChance)
    const call = adjudicate(whiteWinChances, game.current.ply)
    if (call) {
      ending = 'draw' in call ? 'move-limit' : 'adjudicated'
      adjudicated = 'draw' in call ? '1/2-1/2' : call.winner === 'white' ? '1-0' : '0-1'
      break
    }
  }

  const result = adjudicated ?? (resultOf(game.status()) as Exclude<GameResult, '*'>)
  const pgn = exportPgn(game, {
    Event: 'Chessy bot calibration',
    White: players.white.name,
    Black: players.black.name,
    Result: result,
    ...(ending !== 'board' && {
      Termination: ending === 'adjudicated' ? 'Adjudication' : 'Move limit',
    }),
  })
  return {
    white: players.white.name,
    black: players.black.name,
    result,
    ending,
    plies: game.current.ply,
    pgn,
  }
}
