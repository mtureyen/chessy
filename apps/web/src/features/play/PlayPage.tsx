import { createGame, exportPgn, type Color, type PgnHeaders } from '@pawnia/chess'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useServices } from '@/app/servicesContext'
import { Board } from '@/shared/board/Board'
import { GameStatusBar } from '@/shared/game/GameStatusBar'
import { MoveTree } from '@/shared/game/MoveTree'
import { NavigationControls } from '@/shared/game/NavigationControls'
import { PgnPanel } from '@/shared/game/PgnPanel'
import { PlayerBar } from '@/shared/game/PlayerBar'
import { playerBars, useMaterial } from '@/shared/game/players'
import { useGame } from '@/shared/game/useGame'
import { useGameKeyboard } from '@/shared/game/useGameKeyboard'
import '@/shared/game/GamePanel.css'

const newRecord = () => ({ id: crypto.randomUUID(), startedAt: new Date().toISOString() })

/**
 * Local two-player game on one screen. The board freezes once the game is over. A finished game
 * is saved to the library by itself; "Save" keeps one midway, and from then on every move.
 */
export function PlayPage() {
  const { game, view, update, replace } = useGame({ freezeWhenOver: true })
  const [headers, setHeaders] = useState<PgnHeaders>({})
  const [orientation, setOrientation] = useState<Color>('white')
  const navigate = useNavigate()
  const { play } = useServices()
  const [record, setRecord] = useState(newRecord)
  const [saved, setSaved] = useState<'no' | 'saving' | 'yes' | 'failed'>('no')
  const saves = useRef<Promise<unknown>>(Promise.resolve())

  const end = view.line.at(-1) ?? view.root
  const plies = end.ply
  const over = game.status(end).kind !== 'ongoing'
  const save = () => {
    setSaved('saving')
    const next = saves.current.then(() => play.saveLocalGame({ game, headers, record }))
    saves.current = next.catch(() => undefined)
    next.then(() => setSaved('yes')).catch(() => setSaved('failed'))
  }
  // Saves a finished game, and every move of a game saved before. Read through a ref: the effect
  // runs on a new move or the end, not when `saved` changes.
  const latest = useRef({ save, saved })
  useEffect(() => {
    latest.current = { save, saved }
  })
  useEffect(() => {
    if (plies > 0 && (over || latest.current.saved === 'yes')) latest.current.save()
  }, [plies, over])
  const startOver = (next: ReturnType<typeof createGame>, nextHeaders: PgnHeaders) => {
    replace(next)
    setHeaders(nextHeaders)
    setRecord(newRecord())
    setSaved('no')
  }

  const flip = () => setOrientation((o) => (o === 'white' ? 'black' : 'white'))
  useGameKeyboard(
    update,
    useMemo(() => ({ f: flip }), []),
  )
  const material = useMaterial(view.current)
  const players = playerBars(headers, view, material)

  return (
    <div className="layout has-players">
      <section className="board-column">
        <PlayerBar {...players[orientation === 'white' ? 'black' : 'white']} />
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
        <PlayerBar {...players[orientation]} />
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
            <button type="button" onClick={() => startOver(createGame(), {})}>
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
              disabled={plies === 0 || saved === 'saving'}
              title="Keep this game in your games"
              onClick={save}
            >
              {saved === 'yes' ? 'Saved' : 'Save'}
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

        {saved === 'yes' && (
          <p className="message message-info play-saved" role="status">
            Saved to your games{over ? '.' : ', updated with every move.'}
          </p>
        )}
        {saved === 'failed' && (
          <p className="message message-error play-saved" role="alert">
            Could not save the game.
          </p>
        )}

        <PgnPanel
          game={game}
          fen={view.fen}
          headers={headers}
          onLoad={(loaded, loadedHeaders) => startOver(loaded, loadedHeaders)}
        />
      </aside>
    </div>
  )
}
