import { useEffect, useState } from 'react'
import {
  createGame,
  exportPgn,
  importPgn,
  type Color,
  type GameStatus,
  type PgnHeaders,
} from '@chessy/chess'
import { Board } from '@/shared/board/Board'
import { MoveList } from '@/shared/game/MoveList'
import { useGame } from '@/shared/game/useGame'
import './PlayPage.css'

const FEN_PATTERN = /^\s*[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}(\s|$)/

/** Local two-player game on one screen (Phase 0). */
export function PlayPage() {
  const { game, view, update, replace } = useGame()
  const [headers, setHeaders] = useState<PgnHeaders>({})
  const [orientation, setOrientation] = useState<Color>('white')
  const [text, setText] = useState('')
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string }>()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return
      const actions: Record<string, () => void> = {
        ArrowLeft: () => update((g) => g.back()),
        ArrowRight: () => update((g) => g.forward()),
        ArrowUp: () => update((g) => g.toStart()),
        Home: () => update((g) => g.toStart()),
        ArrowDown: () => update((g) => g.toEnd()),
        End: () => update((g) => g.toEnd()),
        f: () => setOrientation((o) => (o === 'white' ? 'black' : 'white')),
      }
      const action = actions[e.key]
      if (action) {
        e.preventDefault()
        action()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [update])

  const load = () => {
    try {
      if (FEN_PATTERN.test(text)) {
        replace(createGame(text))
        setHeaders({})
        setMessage({ kind: 'info', text: 'Position loaded' })
      } else {
        const imported = importPgn(text)
        replace(imported.game)
        setHeaders(imported.headers)
        setMessage({ kind: 'info', text: 'Game loaded' })
      }
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    }
  }

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setMessage({ kind: 'info', text: `${label} copied` })
    } catch {
      setMessage({ kind: 'error', text: `Could not copy ${label}` })
    }
  }

  const newGame = () => {
    replace(createGame())
    setHeaders({})
    setMessage(undefined)
  }

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
        <div className={`status status-${view.status.kind}`}>
          {describeStatus(view.status, view.turn, view.check)}
        </div>

        <div className="moves">
          <MoveList
            line={view.line}
            current={view.current}
            onSelect={(node) => update((g) => g.goTo(node))}
          />
        </div>

        <div className="controls">
          <div className="nav">
            <button
              type="button"
              title="Start (↑)"
              disabled={view.atStart}
              onClick={() => update((g) => g.toStart())}
            >
              ⏮
            </button>
            <button
              type="button"
              title="Back (←)"
              disabled={view.atStart}
              onClick={() => update((g) => g.back())}
            >
              ◀
            </button>
            <button
              type="button"
              title="Forward (→)"
              disabled={view.atEnd}
              onClick={() => update((g) => g.forward())}
            >
              ▶
            </button>
            <button
              type="button"
              title="End (↓)"
              disabled={view.atEnd}
              onClick={() => update((g) => g.toEnd())}
            >
              ⏭
            </button>
          </div>
          <div className="actions">
            <button type="button" onClick={newGame}>
              New game
            </button>
            <button
              type="button"
              disabled={view.atStart}
              onClick={() => update((g) => g.takeback())}
            >
              Takeback
            </button>
            <button
              type="button"
              title="Flip board (F)"
              onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
            >
              Flip
            </button>
          </div>
        </div>

        <div className="io">
          <label className="io-label" htmlFor="fen">
            FEN
          </label>
          <div className="io-row">
            <input
              id="fen"
              className="fen"
              readOnly
              value={view.fen}
              onFocus={(e) => e.target.select()}
            />
            <button type="button" onClick={() => copy('FEN', view.fen)}>
              Copy
            </button>
          </div>

          <label className="io-label" htmlFor="import">
            Import PGN / FEN
          </label>
          <textarea
            id="import"
            rows={5}
            placeholder="Paste a PGN or FEN…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="io-row">
            <button type="button" disabled={!text.trim()} onClick={load}>
              Load
            </button>
            <button type="button" onClick={() => setText(exportPgn(game, headers))}>
              Show PGN
            </button>
            <button type="button" onClick={() => copy('PGN', exportPgn(game, headers))}>
              Copy PGN
            </button>
          </div>
          {message && <p className={`message message-${message.kind}`}>{message.text}</p>}
        </div>
      </aside>
    </div>
  )
}

const DRAW_REASONS: Record<Extract<GameStatus, { kind: 'draw' }>['reason'], string> = {
  stalemate: 'stalemate',
  'insufficient-material': 'insufficient material',
  'threefold-repetition': 'threefold repetition',
  'fifty-move-rule': 'fifty-move rule',
}

function describeStatus(status: GameStatus, turn: Color, check: boolean): string {
  switch (status.kind) {
    case 'checkmate':
      return `Checkmate · ${capitalize(status.winner)} wins`
    case 'draw':
      return `Draw · ${DRAW_REASONS[status.reason]}`
    case 'ongoing':
      return `${capitalize(turn)} to move${check ? ' · check' : ''}`
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
