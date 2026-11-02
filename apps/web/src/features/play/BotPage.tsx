import type { Color } from '@chessy/chess'
import {
  BOT_LEVELS,
  botLevel,
  botName,
  opposite,
  resolveColor,
  seededRandom,
  type BotGameSetup,
  type ColorChoice,
} from '@chessy/play'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Board } from '@/shared/board/Board'
import { GameStatusBar } from '@/shared/game/GameStatusBar'
import { MoveTree } from '@/shared/game/MoveTree'
import { NavigationControls } from '@/shared/game/NavigationControls'
import { useGameKeyboard } from '@/shared/game/useGameKeyboard'
import { useBotGame } from './useBotGame'
import '@/shared/game/GamePanel.css'
import './BotPage.css'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const NO_MOVES = new Map()

interface Match {
  setup: BotGameSetup
  seed: number
  /** Changes per game, so a rematch starts with fresh state. */
  id: number
}

/** Play against a bot: pick a level and a side, play, then review the game. */
export function BotPage() {
  const [level, setLevel] = useState(3)
  const [color, setColor] = useState<ColorChoice>('white')
  const [match, setMatch] = useState<Match>()

  const start = (setup: Omit<BotGameSetup, 'color'> & { color: ColorChoice }) => {
    const seed = Math.floor(Math.random() * 2 ** 32)
    setMatch((previous) => ({
      setup: { level: setup.level, color: resolveColor(setup.color, seededRandom(seed)) },
      seed,
      id: (previous?.id ?? 0) + 1,
    }))
  }

  if (match) {
    return (
      <BotGame
        key={match.id}
        setup={match.setup}
        seed={match.seed}
        onRematch={() => start({ level: match.setup.level, color: opposite(match.setup.color) })}
        onNewGame={() => setMatch(undefined)}
      />
    )
  }

  return (
    <div className="layout">
      <section className="board-column">
        <Board
          fen={START_FEN}
          orientation={color === 'black' ? 'black' : 'white'}
          turnColor="white"
          dests={NO_MOVES}
          check={false}
          isPromotion={() => false}
          onMove={() => {}}
        />
      </section>
      <aside className="panel bot-setup">
        <h2>Play vs bot</h2>
        <fieldset className="bot-levels">
          <legend>Level</legend>
          {BOT_LEVELS.map((l) => (
            <button
              key={l.level}
              type="button"
              aria-pressed={level === l.level}
              onClick={() => setLevel(l.level)}
            >
              <span className="bot-level-number">{l.level}</span>
              <span className="bot-level-name">{l.name}</span>
            </button>
          ))}
        </fieldset>
        <fieldset className="bot-colors">
          <legend>You play</legend>
          {(['white', 'random', 'black'] as const).map((c) => (
            <button key={c} type="button" aria-pressed={color === c} onClick={() => setColor(c)}>
              {c === 'random' ? 'Random' : c === 'white' ? 'White' : 'Black'}
            </button>
          ))}
        </fieldset>
        <button
          type="button"
          className="bot-play"
          onClick={() => start({ level: botLevel(level), color })}
        >
          Play
        </button>
      </aside>
    </div>
  )
}

interface BotGameProps {
  setup: BotGameSetup
  seed: number
  onRematch: () => void
  onNewGame: () => void
}

function BotGame({ setup, seed, onRematch, onNewGame }: BotGameProps) {
  const bot = useBotGame(setup, seed)
  const { game, view, update } = bot
  const [orientation, setOrientation] = useState<Color>(setup.color)
  const navigate = useNavigate()

  const flip = () => setOrientation((o) => opposite(o))
  useGameKeyboard(
    update,
    useMemo(() => ({ f: flip }), []),
  )

  const myTurn = !bot.over && view.atEnd && view.turn === setup.color
  const savedId = bot.save.status === 'saved' ? bot.save.game.id : undefined

  return (
    <div className="layout">
      <section className="board-column">
        <Board
          fen={view.fen}
          orientation={orientation}
          turnColor={view.turn}
          dests={myTurn ? view.dests : NO_MOVES}
          lastMove={view.lastMove}
          check={view.check}
          isPromotion={(from, to) => game.isPromotion(from, to)}
          onMove={(move) => update((g) => g.play(move))}
        />
      </section>

      <aside className="panel">
        <div className="bot-opponent">
          <span className={`player-dot player-dot-${opposite(setup.color)}`} aria-hidden />
          <span className="bot-opponent-name">{botName(setup.level)}</span>
          <span className="bot-opponent-level">{setup.level.name}</span>
          {bot.botThinking && (
            <span className="bot-thinking" role="status">
              thinking…
            </span>
          )}
        </div>
        {bot.resigned ? (
          <div className="status status-checkmate">
            You resigned · {capitalize(opposite(bot.resigned))} wins
          </div>
        ) : (
          <GameStatusBar status={view.status} turn={view.turn} check={view.check} />
        )}
        {bot.botError && (
          <div className="bot-error" role="alert">
            The bot could not move: {bot.botError}{' '}
            <button type="button" onClick={bot.retryBot}>
              Retry
            </button>
          </div>
        )}

        <div className="moves">
          <MoveTree
            root={view.root}
            current={view.current}
            onSelect={(node) => update((g) => g.goTo(node))}
          />
        </div>

        {bot.over && (
          <div className="bot-over">
            <button
              type="button"
              className="bot-review"
              disabled={!savedId}
              onClick={() =>
                savedId && navigate({ to: '/analysis', search: { game: savedId, review: true } })
              }
            >
              Review game
            </button>
            <p className="bot-saved">
              {bot.save.status === 'saved' && 'Saved to your games.'}
              {bot.save.status === 'saving' && 'Saving…'}
              {bot.save.status === 'error' && `Could not save: ${bot.save.message}`}
            </p>
          </div>
        )}

        <div className="controls">
          <NavigationControls view={view} update={update} />
          <div className="actions">
            {bot.over ? (
              <>
                <button type="button" onClick={onRematch}>
                  Rematch
                </button>
                <button type="button" onClick={onNewGame}>
                  New game
                </button>
              </>
            ) : (
              <>
                <button type="button" disabled={!bot.canTakeback} onClick={bot.takeback}>
                  Takeback
                </button>
                <button type="button" onClick={bot.resign}>
                  Resign
                </button>
              </>
            )}
            <button type="button" title="Flip board (F)" onClick={flip}>
              Flip
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
