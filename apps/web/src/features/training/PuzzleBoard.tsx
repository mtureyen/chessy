import type { PuzzleBody } from '@pawnia/contracts'
import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { SearchStatus } from '@/features/review/SearchStatus'
import { useMoveTry } from '@/features/review/useMoveTry'
import type { BoardTry } from '@/features/review/walkthrough'
import { Board, type BoardDrawing } from '@/shared/board/Board'
import { useGame } from '@/shared/game/useGame'
import { createGame } from '@pawnia/chess'

const NO_MOVES = new Map()

/** One mistake to solve again. Solved at the first try it is done; else it comes back later. */
export function PuzzleBoard({
  puzzle,
  onResult,
  onNext,
}: {
  puzzle: PuzzleBody
  onResult: (solvedFirstTry: boolean) => void
  onNext: () => void
}) {
  const { game, view } = useGame({ initial: () => createGame(puzzle.fen) })
  const [attempt, setAttempt] = useState<BoardTry>()
  const [answer, setAnswer] = useState<BoardDrawing>()
  const firstTry = useRef(true)
  const recorded = useRef(false)

  const finish = (solvedFirstTry: boolean) => {
    if (!recorded.current) onResult(solvedFirstTry)
    recorded.current = true
  }
  const showAnswer = () => {
    const { uci } = puzzle.best
    setAnswer({
      arrows: [{ from: uci.slice(0, 2), to: uci.slice(2, 4), color: 'green' }],
      squares: [],
    })
  }
  const { search, look, stop } = useMoveTry({
    line: puzzle.line,
    onBoard: setAttempt,
    onJudged: (judged) => {
      if (judged.verdict === 'right') finish(firstTry.current)
      else firstTry.current = false
    },
    onRight: showAnswer,
  })
  const [started, setStarted] = useState(false)
  if (!started) {
    setStarted(true)
    look(puzzle.fen, puzzle.ply)
  }
  const reveal = () => {
    finish(false)
    stop()
    showAnswer()
  }

  const tried = attempt?.shown
  const done = answer !== undefined
  return (
    <div className="layout">
      <section className="board-column">
        <Board
          fen={tried?.fen ?? view.fen}
          orientation={puzzle.color}
          turnColor={tried ? (view.turn === 'white' ? 'black' : 'white') : view.turn}
          dests={attempt && !tried ? view.dests : NO_MOVES}
          {...(tried && { lastMove: tried.lastMove })}
          check={tried ? false : view.check}
          isPromotion={(from, to) => game.isPromotion(from, to)}
          onMove={(move) => attempt?.onMove(move)}
          {...(answer && { drawing: answer })}
        />
      </section>
      <aside className="panel training-panel" aria-label="Puzzle">
        <div className="training-text">
          <h2>Find a better move</h2>
          <p>
            You played <strong>{puzzle.played}</strong> here against {puzzle.game.opponent} on{' '}
            {puzzle.game.date}.
          </p>
          {search && <SearchStatus search={search} />}
          {done && (
            <p className="training-answer">
              Best was <strong>{puzzle.best.move}</strong>: {puzzle.best.line}
            </p>
          )}
        </div>
        <div className="training-actions">
          {!done && search?.status !== 'looking' && (
            <button
              type="button"
              disabled={search?.status === 'checking'}
              onClick={() => look(puzzle.fen, puzzle.ply)}
            >
              Try again
            </button>
          )}
          {!done && (
            <button type="button" disabled={search?.status === 'checking'} onClick={reveal}>
              Show the answer
            </button>
          )}
          {done && (
            <button type="button" className="training-next" onClick={onNext}>
              Next
            </button>
          )}
          <Link to="/analysis" search={{ game: puzzle.game.id }}>
            Open the game
          </Link>
        </div>
      </aside>
    </div>
  )
}
