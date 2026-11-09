import { createGame, type Move, type SquareName } from '@pawnia/chess'
import type { CoachTryBody } from '@pawnia/contracts'
import { useCallback, useRef, useState } from 'react'
import { useServices } from '@/app/servicesContext'
import type { BoardTry } from './walkthrough'

/** Where the user's search for the better move stands. */
export type Search =
  | { status: 'looking' }
  | { status: 'checking'; san: string }
  | { status: 'judged'; answer: CoachTryBody }
  | { status: 'failed'; message: string }

/**
 * Looking for the better move at a moment of a reviewed game: `look` hands the board over through
 * `onBoard`, a move played on it is judged and stays out of the game, and the right one ends the
 * search. An answer to an older try, or after `stop`, is dropped.
 */
export function useMoveTry({
  line,
  onBoard,
  onRight,
  onJudged,
}: {
  line: { startFen: string; moves: string[] }
  onBoard: (attempt: BoardTry | undefined) => void
  onRight: (answer: CoachTryBody) => void
  /** Every verdict, the right one too. */
  onJudged?: (answer: CoachTryBody) => void
}) {
  const { coach } = useServices()
  const [search, setSearch] = useState<Search>()
  const latest = useRef(0)

  const judge = async (move: Move, fen: string, ply: number, attempt: BoardTry) => {
    const after = createGame(fen).play(move)
    if (!after?.move) return
    const { san, uci } = after.move
    const lastMove: [SquareName, SquareName] = [move.from, move.to]
    const current = ++latest.current
    onBoard({ ...attempt, shown: { fen: after.fen, lastMove } })
    setSearch({ status: 'checking', san })
    try {
      const answer = await coach.tryMove({ ...line, ply, tried: uci })
      if (current !== latest.current) return
      setSearch({ status: 'judged', answer })
      onJudged?.(answer)
      if (answer.verdict === 'right') {
        onBoard(undefined)
        onRight(answer)
      }
    } catch (error) {
      if (current !== latest.current) return
      setSearch({
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const look = (fen: string, ply: number) => {
    const attempt: BoardTry = { fen, onMove: (move) => void judge(move, fen, ply, attempt) }
    setSearch({ status: 'looking' })
    onBoard(attempt)
  }

  const stop = useCallback(() => {
    latest.current++
    setSearch(undefined)
    onBoard(undefined)
  }, [onBoard])

  return { search, look, stop }
}
