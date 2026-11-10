import type { PuzzleBody } from '@pawnia/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useServices } from '@/app/servicesContext'
import { PuzzleBoard } from './PuzzleBoard'
import { TrainingTabs } from './TrainingTabs'
import '@/shared/game/GamePanel.css'
import './Training.css'

/** /training: the user's own mistakes as puzzles. */
export function TrainingPage() {
  const { training } = useServices()
  const client = useQueryClient()
  const list = useQuery({ queryKey: ['training'], queryFn: () => training.list(), retry: false })
  /** The round being played: the list at its start, so a solved puzzle doesn't shift it. */
  const [round, setRound] = useState<PuzzleBody[]>()
  const [index, setIndex] = useState(0)

  const puzzle = round?.[index]
  if (puzzle) {
    return (
      <PuzzleBoard
        key={`${puzzle.game.id}:${puzzle.ply}`}
        puzzle={puzzle}
        onResult={(solvedFirstTry) =>
          void training.record({
            ...puzzle.line,
            ply: puzzle.ply,
            solvedFirstTry,
          })
        }
        onNext={() => {
          setIndex((at) => at + 1)
          void client.invalidateQueries({ queryKey: ['training'] })
        }}
      />
    )
  }

  const due = list.data?.due.length ?? 0
  return (
    <div className="training-page">
      <TrainingTabs />
      <h1>Train my mistakes</h1>
      <p className="training-intro">
        Your mistakes from reviewed games, as puzzles. Solve one at the first try and it's done;
        miss it and it comes back after 1, 3 and 7 days.
      </p>
      {list.isError && (
        <p className="message message-error" role="alert">
          {list.error.message}
        </p>
      )}
      {list.data && (
        <>
          <p className="training-counts" role="status">
            {due} to do · {list.data.waiting} coming back later · {list.data.solved} solved
          </p>
          {due > 0 ? (
            <button
              type="button"
              className="training-start"
              onClick={() => {
                setRound(list.data.due)
                setIndex(0)
              }}
            >
              Start
            </button>
          ) : (
            <p className="training-intro">
              {list.data.waiting + list.data.solved > 0 ? (
                'Nothing due right now.'
              ) : (
                <>
                  No puzzles yet: <Link to="/profile">review your recent games</Link> first.
                </>
              )}
            </p>
          )}
        </>
      )}
    </div>
  )
}
