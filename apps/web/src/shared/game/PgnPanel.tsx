import { createGame, exportPgn, importPgn, type GameState, type PgnHeaders } from '@chessy/chess'
import { useState } from 'react'
import './GamePanel.css'

const FEN_PATTERN = /^\s*[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}(\s|$)/

interface PgnPanelProps {
  game: GameState
  fen: string
  headers: PgnHeaders
  onLoad: (game: GameState, headers: PgnHeaders) => void
}

/** Current FEN plus import (PGN or FEN, auto-detected) and PGN export. */
export function PgnPanel({ game, fen, headers, onLoad }: PgnPanelProps) {
  const [text, setText] = useState('')
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string }>()

  const load = () => {
    try {
      if (FEN_PATTERN.test(text)) {
        onLoad(createGame(text), {})
        setMessage({ kind: 'info', text: 'Position loaded' })
      } else {
        const imported = importPgn(text)
        onLoad(imported.game, imported.headers)
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

  return (
    <div className="io">
      <label className="io-label" htmlFor="fen">
        FEN
      </label>
      <div className="io-row">
        <input id="fen" className="fen" readOnly value={fen} onFocus={(e) => e.target.select()} />
        <button type="button" onClick={() => copy('FEN', fen)}>
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
  )
}
