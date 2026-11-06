import { exportPgn, importPgn, type Color } from '@chessy/chess'
import { LOCAL_PLAYER_NAME } from '@chessy/library'
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
  type UnfinishedBotGame,
} from '@chessy/play'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useServices } from '@/app/servicesContext'
import { CoachPanel } from '@/features/coach/CoachPanel'
import { Markdown } from '@/features/coach/Markdown'
import { findPosition, MAX_PGN_LENGTH, usualRating } from '@/features/coach/situation'
import { useCoachChat } from '@/features/coach/useCoachChat'
import { useCoachDrawing } from '@/features/coach/useCoachDrawing'
import { usePlayer, useProfile } from '@/features/profile/useProfile'
import { ClassBadge } from '@/features/review/ClassBadge'
import { Board } from '@/shared/board/Board'
import { GameStatusBar } from '@/shared/game/GameStatusBar'
import { MoveTree } from '@/shared/game/MoveTree'
import { NavigationControls } from '@/shared/game/NavigationControls'
import { useGameKeyboard } from '@/shared/game/useGameKeyboard'
import { ClockFace } from './ClockFace'
import { coachCommentsOn, rememberCoachComments } from './coachComments'
import { useBotGame } from './useBotGame'
import { useMoveComments, type MoveComment } from './useMoveComments'
import '@/features/review/Review.css'
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
  /** A saved unfinished game this match continues. */
  resume?: UnfinishedBotGame
  /** Changes per game, so a rematch starts with fresh state. */
  id: number
}

/** A bot game left midway, offered to continue (a new game leaves it unfinished in the history). */
function ResumeCard({
  game,
  onResume,
}: {
  game: UnfinishedBotGame
  onResume: (game: UnfinishedBotGame) => void
}) {
  const moves = useMemo(() => {
    const { game: replay } = importPgn(game.record.pgn)
    replay.toStart()
    return Math.ceil(replay.line().length / 2)
  }, [game])
  const { level, timeControl } = game.setup
  return (
    <div className="bot-resume" data-testid="resume-bot-game">
      <div>
        <strong>Unfinished game</strong>
        <span>
          {[
            `vs ${botName(level)}`,
            `${moves} ${moves === 1 ? 'move' : 'moves'}`,
            timeControl
              ? `${timeControl.initialMs / 60_000}+${timeControl.incrementMs / 1000}`
              : 'no clock',
          ].join(' · ')}
        </span>
      </div>
      <button type="button" className="bot-play" onClick={() => onResume(game)}>
        Resume
      </button>
    </div>
  )
}

/** Turns the coach's comments on the user's moves on and off. */
function CommentsSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="bot-comments-switch">
      <input
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
      />
      Coach comments
    </label>
  )
}

/** What the coach said about the user's moves during the game. */
function MoveComments({ comments }: { comments: MoveComment[] }) {
  return (
    <ul className="bot-comments" aria-label="Coach comments" aria-live="polite">
      {comments.map((comment) => (
        <li key={comment.ply}>
          <span className="bot-comment-move">
            <ClassBadge cls={comment.verdict} /> {comment.move}
          </span>
          <Markdown text={comment.text} />
        </li>
      ))}
    </ul>
  )
}

/** Play against a bot: pick a level and a side, play, then review the game. */
export function BotPage() {
  const [level, setLevel] = useState(3)
  const [color, setColor] = useState<ColorChoice>('white')
  /** Index into TIME_CONTROLS; -1 for no clock. */
  const [clockChoice, setClockChoice] = useState(-1)
  const [match, setMatch] = useState<Match>()
  const [comments, setComments] = useState(coachCommentsOn)
  const humanModel = useHumanModel()
  const { play } = useServices()
  const unfinished = useQuery({
    queryKey: ['unfinished-bot-game'],
    queryFn: async () => (await play.unfinishedBotGame()) ?? null,
    enabled: !match,
  })

  const start = ({ color, ...setup }: Omit<BotGameSetup, 'color'> & { color: ColorChoice }) => {
    const seed = Math.floor(Math.random() * 2 ** 32)
    setMatch((previous) => ({
      setup: { ...setup, color: resolveColor(color, seededRandom(seed)) },
      seed,
      id: (previous?.id ?? 0) + 1,
    }))
  }

  const switchComments = (on: boolean) => {
    rememberCoachComments(on)
    setComments(on)
  }

  const resume = (game: UnfinishedBotGame) =>
    setMatch((previous) => ({
      setup: game.setup,
      seed: Math.floor(Math.random() * 2 ** 32),
      resume: game,
      id: (previous?.id ?? 0) + 1,
    }))

  if (match) {
    return (
      <BotGame
        key={match.id}
        setup={match.setup}
        seed={match.seed}
        {...(match.resume && { resume: match.resume })}
        comments={comments}
        onSwitchComments={switchComments}
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
        {unfinished.data && <ResumeCard game={unfinished.data} onResume={resume} />}
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
        <CommentsSwitch on={comments} onChange={switchComments} />
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
  resume?: UnfinishedBotGame
  /** Whether the coach comments on the user's moves. */
  comments: boolean
  onSwitchComments: (on: boolean) => void
  onRematch: () => void
  onNewGame: () => void
}

function BotGame({
  setup,
  seed,
  resume,
  comments,
  onSwitchComments,
  onRematch,
  onNewGame,
}: BotGameProps) {
  const bot = useBotGame(setup, seed, resume)
  const { game, view, update } = bot
  const humanModel = useHumanModel()
  const [orientation, setOrientation] = useState<Color>(setup.color)
  const [tab, setTab] = useState<'moves' | 'coach'>('moves')
  const navigate = useNavigate()
  const profile = useProfile()
  const account = profile.data?.accounts[0]
  const player = usePlayer(account?.source ?? 'chesscom', account?.username)
  const rating = player.data && usualRating(player.data.ratings)

  const { shownDrawing, showDrawing } = useCoachDrawing(view, update)
  const chat = useCoachChat({ onDrawing: showDrawing })
  const moveComments = useMoveComments({
    view,
    color: setup.color,
    agent: chat.agent?.id,
    rating,
    enabled: comments && chat.agent !== undefined,
  })
  const coachContext = () => {
    const { color, level } = setup
    const [white, black] =
      color === 'white' ? [LOCAL_PLAYER_NAME, botName(level)] : [botName(level), LOCAL_PLAYER_NAME]
    // The saved game also has the result and how it ended.
    const pgn =
      bot.save.status === 'saved'
        ? bot.save.game.pgn
        : exportPgn(game, { White: white, Black: black })
    return {
      fen: view.fen,
      ...(pgn.length <= MAX_PGN_LENGTH && { pgn }),
      ...(rating && { rating }),
    }
  }

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
          drawing={shownDrawing}
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

        {bot.over && (
          <div className="panel-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'moves'}
              onClick={() => setTab('moves')}
            >
              Moves
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'coach'}
              onClick={() => setTab('coach')}
            >
              {chat.answering && tab !== 'coach' ? 'Coach …' : 'Coach'}
            </button>
          </div>
        )}

        <div className={tab === 'coach' ? 'moves moves-coach' : 'moves'}>
          {tab === 'coach' ? (
            <CoachPanel
              chat={chat}
              context={coachContext}
              canShow={(fen) => findPosition(view.root, fen) !== undefined}
              onShow={showDrawing}
              orientation={orientation}
            />
          ) : (
            <MoveTree
              root={view.root}
              current={view.current}
              onSelect={(node) => update((g) => g.goTo(node))}
            />
          )}
        </div>

        {tab === 'moves' && (!bot.over || moveComments.length > 0) && (
          <section className="bot-coach" aria-label="Coach">
            {!bot.over && (
              <>
                <CommentsSwitch on={comments} onChange={onSwitchComments} />
                <p className="bot-coach-closed">
                  You can ask the coach when the game is over; it opens here then.
                </p>
                {comments && !chat.agents.isPending && !chat.agent && (
                  <p className="bot-coach-closed">
                    No coach is ready to comment.{' '}
                    <Link to="/settings" search={{ tab: 'coach' }}>
                      Set one up
                    </Link>
                  </p>
                )}
              </>
            )}
            {moveComments.length > 0 && <MoveComments comments={moveComments} />}
          </section>
        )}

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
