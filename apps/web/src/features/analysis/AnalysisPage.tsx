import { createGame, importPgn, type Color, type GameState, type PgnHeaders } from '@chessy/chess'
import { useMemo, useState } from 'react'
import { Board, type BoardArrow } from '@/shared/board/Board'
import { GameStatusBar } from '@/shared/game/GameStatusBar'
import { MoveTree } from '@/shared/game/MoveTree'
import { NavigationControls } from '@/shared/game/NavigationControls'
import { PgnPanel } from '@/shared/game/PgnPanel'
import { useGame } from '@/shared/game/useGame'
import { useGameKeyboard } from '@/shared/game/useGameKeyboard'
import { EnginePanel } from './EnginePanel'
import { EvalBar } from './EvalBar'
import type { AnalysisSearch } from './search'
import { useEngineAnalysis } from './useEngineAnalysis'
import '@/shared/game/GamePanel.css'
import './AnalysisPage.css'

const MAX_DEPTH = 22

/** Free analysis board: engine with eval bar and best lines, explore any variation. */
export function AnalysisPage({ initial }: { initial: AnalysisSearch }) {
  const [boot] = useState(() => openInitial(initial))
  const { game, view, update, replace } = useGame({ initial: () => boot.game })
  const [headers, setHeaders] = useState<PgnHeaders>(boot.headers)
  const [orientation, setOrientation] = useState<Color>('white')
  const [engineEnabled, setEngineEnabled] = useState(true)
  const [multiPv, setMultiPv] = useState(3)

  const gameOver = view.dests.size === 0
  const engine = useEngineAnalysis(view.fen, {
    enabled: engineEnabled && !gameOver,
    multiPv,
    maxDepth: MAX_DEPTH,
  })
  const lines = engine.snapshot?.lines ?? []

  const arrows: BoardArrow[] = engineEnabled
    ? lines.flatMap((line, i) => {
        const uci = line.pv[0]
        if (!uci) return []
        const kind = i === 0 ? 'best' : 'alternative'
        return [{ from: uci.slice(0, 2), to: uci.slice(2, 4), kind } as BoardArrow]
      })
    : []

  const flip = () => setOrientation((o) => (o === 'white' ? 'black' : 'white'))
  useGameKeyboard(
    update,
    useMemo(() => ({ f: flip, l: () => setEngineEnabled((on) => !on) }), []),
  )

  return (
    <div className="layout layout-analysis">
      <div className="eval-column">
        <EvalBar
          score={engineEnabled ? lines[0]?.score : undefined}
          status={view.status}
          orientation={orientation}
        />
      </div>

      <section className="board-column">
        <Board
          fen={view.fen}
          orientation={orientation}
          turnColor={view.turn}
          dests={view.dests}
          lastMove={view.lastMove}
          check={view.check}
          arrows={arrows}
          isPromotion={(from, to) => game.isPromotion(from, to)}
          onMove={(move) => update((g) => g.play(move))}
        />
      </section>

      <aside className="panel">
        <EnginePanel
          fen={view.fen}
          state={engine}
          enabled={engineEnabled}
          gameOver={gameOver}
          multiPv={multiPv}
          maxDepth={MAX_DEPTH}
          onToggle={() => setEngineEnabled((on) => !on)}
          onMultiPvChange={setMultiPv}
          onPlayLine={(pv, index) =>
            update((g) => {
              for (const uci of pv.slice(0, index + 1)) if (!g.play(uci)) break
            })
          }
        />

        <GameStatusBar status={view.status} turn={view.turn} check={view.check} />
        {boot.error && <p className="message message-error analysis-load-error">{boot.error}</p>}

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
              title="Move this variation up one level"
              disabled={view.isMainline}
              onClick={() => update((g) => g.promote(g.current))}
            >
              Promote
            </button>
            <button
              type="button"
              title="Make this the main line"
              disabled={view.isMainline}
              onClick={() => update((g) => g.makeMainline(g.current))}
            >
              Main line
            </button>
            <button
              type="button"
              title="Delete this move and everything after it"
              disabled={view.atStart}
              onClick={() => update((g) => g.delete(g.current))}
            >
              Delete
            </button>
            <button type="button" title="Flip board (F)" onClick={flip}>
              Flip
            </button>
          </div>
        </div>

        <details className="io-details">
          <summary>Import / export</summary>
          <PgnPanel
            game={game}
            fen={view.fen}
            headers={headers}
            onLoad={(loaded, loadedHeaders) => {
              replace(loaded)
              setHeaders(loadedHeaders)
            }}
          />
        </details>
      </aside>
    </div>
  )
}

/** Opens the game or position from the URL; falls back to the start position with an error. */
function openInitial(search: AnalysisSearch): {
  game: GameState
  headers: PgnHeaders
  error?: string
} {
  try {
    if (search.pgn) {
      const { game, headers } = importPgn(search.pgn)
      return { game, headers }
    }
    if (search.fen) return { game: createGame(search.fen), headers: {} }
  } catch (err) {
    return {
      game: createGame(),
      headers: {},
      error: `Could not open: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  return { game: createGame(), headers: {} }
}
