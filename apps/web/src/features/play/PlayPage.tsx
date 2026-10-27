import { createGame, exportPgn, type Color, type PgnHeaders } from '@chessy/chess'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Board } from '@/shared/board/Board'
import { GameStatusBar } from '@/shared/game/GameStatusBar'
import { MoveTree } from '@/shared/game/MoveTree'
import { NavigationControls } from '@/shared/game/NavigationControls'
import { PgnPanel } from '@/shared/game/PgnPanel'
import { useGame } from '@/shared/game/useGame'
import { useGameKeyboard } from '@/shared/game/useGameKeyboard'
import '@/shared/game/GamePanel.css'

/** Local two-player game on one screen. The board freezes once the game is over. */
export function PlayPage() {
  const { game, view, update, replace } = useGame({ freezeWhenOver: true })
  const [headers, setHeaders] = useState<PgnHeaders>({})
  const [orientation, setOrientation] = useState<Color>('white')
  const navigate = useNavigate()

  const flip = () => setOrientation((o) => (o === 'white' ? 'black' : 'white'))
  useGameKeyboard(
    update,
    useMemo(() => ({ f: flip }), []),
  )

  return (
    <div className="layout">
      <section className="board-column">
        <Board
          fen={view.fen}
          orientation={orientation}
          turnColor={view.turn}
          dests={view.dests}
          lastMove={view.lastMove}
          check={view.check}
          isPromotion={(from, to) => game.isPromotion(from, to)}
          onMove={(move) => update((g) => g.play(move))}
        />
      </section>

      <aside className="panel">
        <GameStatusBar status={view.status} turn={view.turn} check={view.check} />

        <div className="moves">
          <MoveTree
            root={view.root}
            current={view.current}
            onSelect={(node) => update((g) => g.goTo(node))}
          />
        </div>

        <div className="controls">
          <NavigationControls view={view} update={update} />
          <div className="actions">
            <button
              type="button"
              onClick={() => {
                replace(createGame())
                setHeaders({})
              }}
            >
              New game
            </button>
            <button
              type="button"
              disabled={view.atStart}
              onClick={() => update((g) => g.takeback())}
            >
              Takeback
            </button>
            <button type="button" title="Flip board (F)" onClick={flip}>
              Flip
            </button>
            <button
              type="button"
              title="Open this game on the analysis board"
              onClick={() =>
                navigate({ to: '/analysis', search: { pgn: exportPgn(game, headers) } })
              }
            >
              Analyse
            </button>
          </div>
        </div>

        <PgnPanel
          game={game}
          fen={view.fen}
          headers={headers}
          onLoad={(loaded, loadedHeaders) => {
            replace(loaded)
            setHeaders(loadedHeaders)
          }}
        />
      </aside>
    </div>
  )
}
