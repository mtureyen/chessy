import type { Color } from '@chessy/chess'
import {
  approximateRating,
  BOT_LEVELS,
  botLevel,
  botName,
  opposite,
  resolveColor,
  seededRandom,
  TIME_CONTROLS,
  type BotGameSetup,
  type ColorChoice,
  type Termination,
} from '@chessy/play'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useServices } from '@/app/servicesContext'
import { Board } from '@/shared/board/Board'
import { GameStatusBar } from '@/shared/game/GameStatusBar'
import { MoveTree } from '@/shared/game/MoveTree'
import { NavigationControls } from '@/shared/game/NavigationControls'
import { useGameKeyboard } from '@/shared/game/useGameKeyboard'
import { ClockFace } from './ClockFace'
import { useBotGame } from './useBotGame'
import '@/shared/game/GamePanel.css'
import './BotPage.css'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const NO_MOVES = new Map()
const HUMAN_LEVELS = BOT_LEVELS.filter((l) => l.human).map((l) => l.level)

/** The human-move model human-like levels play with, or null when the server has none. */
function useHumanModel() {
  const { play } = useServices()
  return useQuery({
    queryKey: ['human-model'],
    queryFn: async () => (await play.humanModel()) ?? null,
    staleTime: 30_000,
  }).data
}

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
  /** Index into TIME_CONTROLS; -1 for no clock. */
  const [clockChoice, setClockChoice] = useState(-1)
  const [match, setMatch] = useState<Match>()
  const humanModel = useHumanModel()

  const start = ({ color, ...setup }: Omit<BotGameSetup, 'color'> & { color: ColorChoice }) => {
    const seed = Math.floor(Math.random() * 2 ** 32)
    setMatch((previous) => ({
      setup: { ...setup, color: resolveColor(color, seededRandom(seed)) },
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
        onRematch={() => start({ ...match.setup, color: opposite(match.setup.color) })}
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
              {approximateRating(l) && (
                <span className="bot-level-rating">{approximateRating(l)}</span>
              )}
            </button>
          ))}
        </fieldset>
        {humanModel !== undefined && (
          <p className="bot-note" data-testid="human-levels">
            {humanModel
              ? `Levels ${HUMAN_LEVELS[0]}–${HUMAN_LEVELS.at(-1)} play like humans of their rating (${humanModel}); the others play from the engine.`
              : 'Human-like play needs the server’s Maia model; until then every level plays from the engine.'}
          </p>
        )}
        <fieldset className="bot-colors">
          <legend>You play</legend>
          {(['white', 'random', 'black'] as const).map((c) => (
            <button key={c} type="button" aria-pressed={color === c} onClick={() => setColor(c)}>
              {c === 'random' ? 'Random' : c === 'white' ? 'White' : 'Black'}
            </button>
          ))}
        </fieldset>
        <fieldset className="bot-time-controls">
          <legend>Clock</legend>
          <button
            type="button"
            aria-pressed={clockChoice === -1}
            onClick={() => setClockChoice(-1)}
          >
            None
          </button>
          {TIME_CONTROLS.map((preset, index) => (
            <button
              key={preset.label}
              type="button"
              aria-pressed={clockChoice === index}
              onClick={() => setClockChoice(index)}
            >
              {preset.label}
            </button>
          ))}
        </fieldset>
        <button
          type="button"
          className="bot-play"
          onClick={() => {
            const timeControl = TIME_CONTROLS[clockChoice]?.control
            start({ level: botLevel(level), color, ...(timeControl && { timeControl }) })
          }}
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
  const humanModel = useHumanModel()
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
          onMove={bot.move}
        />
      </section>

      <aside className="panel">
        <div className="bot-opponent">
          <span className={`player-dot player-dot-${opposite(setup.color)}`} aria-hidden />
          <span className="bot-opponent-name">{botName(setup.level)}</span>
          <span className="bot-opponent-level">
            {[
              setup.level.name,
              approximateRating(setup.level),
              setup.level.human && humanModel && 'human-like',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {bot.botThinking && (
            <span className="bot-thinking" role="status">
              thinking…
            </span>
          )}
          {bot.clock && <ClockFace clock={bot.clock} color={opposite(setup.color)} />}
        </div>
        {bot.termination ? (
          <div className="status status-checkmate">{describeEnd(bot.termination)}</div>
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

        {bot.drawDeclined && <p className="bot-note">{botName(setup.level)} declines the draw.</p>}

        <div className="bot-you">
          <span className={`player-dot player-dot-${setup.color}`} aria-hidden />
          <span className="bot-opponent-name">You</span>
          {bot.clock && <ClockFace clock={bot.clock} color={setup.color} />}
        </div>

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
                {!bot.clock && (
                  <button type="button" disabled={!bot.canTakeback} onClick={bot.takeback}>
                    Takeback
                  </button>
                )}
                <button
                  type="button"
                  disabled={bot.drawDeclined || view.line.length < 2}
                  onClick={bot.offerDraw}
                >
                  Offer draw
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

/** How the game ended, when not on the board (the status bar covers mate and draws). */
function describeEnd(termination: Termination): string {
  switch (termination.reason) {
    case 'agreement':
      return 'Draw by agreement'
    case 'resignation': // only the user resigns
      return `You resigned · ${winner(termination.loser)} wins`
    case 'timeout':
      return termination.draw
        ? 'Time out · draw (insufficient material)'
        : `Time out · ${winner(termination.loser)} wins`
  }
}

function winner(loser: Color): string {
  return loser === 'white' ? 'Black' : 'White'
}
