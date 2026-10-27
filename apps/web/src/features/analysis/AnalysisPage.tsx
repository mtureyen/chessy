import { createGame, importPgn, type Color, type GameState, type PgnHeaders } from '@chessy/chess'
import { useMemo, useState } from 'react'
import { Board, type BoardArrow } from '@/shared/board/Board'
import { GameStatusBar } from '@/shared/game/GameStatusBar'
import { MoveTree } from '@/shared/game/MoveTree'
import { NavigationControls } from '@/shared/game/NavigationControls'
import { PgnPanel } from '@/shared/game/PgnPanel'
import { useGame, type GameView } from '@/shared/game/useGame'
import { clockAt } from '@/shared/game/clock'
import { useGameKeyboard } from '@/shared/game/useGameKeyboard'
import { EnginePanel } from './EnginePanel'
import { EvalBar } from './EvalBar'
import { PlayerBar, type PlayerBarProps } from './PlayerBar'
import { useEngineAnalysis } from './useEngineAnalysis'
import '@/shared/game/GamePanel.css'
import './AnalysisPage.css'

const MAX_DEPTH = 22

/** Free analysis board: engine with eval bar and best lines, explore any variation. */
/** What to open: a PGN or a FEN, or an error to show (e.g. a library game that is gone). */
export interface AnalysisInitial {
  pgn?: string
  fen?: string
  error?: string
}

export function AnalysisPage({ initial }: { initial: AnalysisInitial }) {
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

  const players = playersFromHeaders(headers, view)

  const flip = () => setOrientation((o) => (o === 'white' ? 'black' : 'white'))
  useGameKeyboard(
    update,
    useMemo(() => ({ f: flip, l: () => setEngineEnabled((on) => !on) }), []),
  )

  return (
    <div className={`layout layout-analysis${players ? ' has-players' : ''}`}>
      <div className="eval-column">
        <EvalBar
          score={engineEnabled ? lines[0]?.score : undefined}
          status={view.status}
          orientation={orientation}
        />
      </div>

      <section className="board-column">
        {players && <PlayerBar {...players[orientation === 'white' ? 'black' : 'white']} />}
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
        {players && <PlayerBar {...players[orientation]} />}
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
/** Player bars from the PGN headers (names, ratings, titles) and the clocks in the tree. */
function playersFromHeaders(
  headers: PgnHeaders,
  view: GameView,
): Record<Color, PlayerBarProps> | undefined {
  const known = (tag: string | undefined) => (tag && tag !== '?' ? tag : undefined) // PGN uses "?" for unknown
  if (!known(headers.White) && !known(headers.Black)) return undefined
  const player = (color: Color, tag: 'White' | 'Black'): PlayerBarProps => ({
    color,
    name: known(headers[tag]) ?? '?',
    rating: known(headers[`${tag}Elo`]),
    title: known(headers[`${tag}Title`]),
    clock: clockAt(view.current, color),
    active: view.turn === color && view.status.kind === 'ongoing',
  })
  return { white: player('white', 'White'), black: player('black', 'Black') }
}

function openInitial(initial: AnalysisInitial): {
  game: GameState
  headers: PgnHeaders
  error?: string
} {
  if (initial.error) return { game: createGame(), headers: {}, error: initial.error }
  try {
    if (initial.pgn) {
      const { game, headers } = importPgn(initial.pgn)
      return { game, headers }
    }
    if (initial.fen) return { game: createGame(initial.fen), headers: {} }
  } catch (err) {
    return {
      game: createGame(),
      headers: {},
      error: `Could not open: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  return { game: createGame(), headers: {} }
}
