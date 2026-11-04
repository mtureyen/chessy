import { createGame, importPgn, type Color, type GameState, type Move } from '@chessy/chess'
import type { LibraryGame } from '@chessy/library'
import {
  acceptsDraw,
  botBudget,
  BotMoveCancelledError,
  createClock,
  flagged,
  opposite,
  pressClock,
  remainingMs,
  seededRandom,
  stopClock,
  timeout,
  type BotGameSetup,
  type ClockState,
  type Termination,
  type TimeControl,
  type UnfinishedBotGame,
} from '@chessy/play'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useServices } from '@/app/servicesContext'
import { useGame } from '@/shared/game/useGame'

export type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; game: LibraryGame }
  | { status: 'error'; message: string }

/** Monotonic time for the clocks; unaffected by changes to the system time. */
const now = () => performance.now()

/**
 * A game against the bot, optionally on a clock. The bot always plays at the end of the game,
 * also while the user looks back at earlier moves. The game is saved after every move under one
 * record (so it can be resumed: `resume`), and once more when it's over.
 */
export function useBotGame(setup: BotGameSetup, seed: number, resume?: UnfinishedBotGame) {
  const { play } = useServices()
  const { game, view, update } = useGame({
    freezeWhenOver: true,
    initial: () => (resume ? importPgn(resume.record.pgn).game : createGame()),
  })
  const [random] = useState(() => seededRandom(seed))
  const [record] = useState(() =>
    resume
      ? { id: resume.record.id, startedAt: resume.record.playedAt }
      : { id: crypto.randomUUID(), startedAt: new Date().toISOString() },
  )
  const [clock, setClockState] = useState(
    () => setup.timeControl && resumedClock(setup.timeControl, game),
  )
  // The clock is read from callbacks that outlive a render (bot replies, timers).
  const clockRef = useRef(clock)
  const [termination, setTermination] = useState<Termination>()
  const [botWinChance, setBotWinChance] = useState<number>()
  const [drawDeclinedAt, setDrawDeclinedAt] = useState<number>()
  const [botError, setBotError] = useState<string>()
  const [attempt, setAttempt] = useState(0)
  const [save, setSave] = useState<SaveState>({ status: 'idle' })
  const saving = useRef(false)
  /** Saves run one after another, so a move's save can't land after the final one. */
  const saves = useRef<Promise<unknown>>(Promise.resolve())
  const enqueueSave = useCallback(<T>(task: () => Promise<T>): Promise<T> => {
    const next = saves.current.then(task)
    saves.current = next.catch(() => undefined)
    return next
  }, [])

  const setClock = useCallback((next: ClockState | undefined) => {
    clockRef.current = next
    setClockState(next)
  }, [])

  const end = view.line.at(-1) ?? view.root
  const endStatus = game.status(end)
  const endTurn: Color = end.ply % 2 === 0 ? 'white' : 'black' // bot games start from the initial position
  const over = endStatus.kind !== 'ongoing' || termination !== undefined
  const botToMove = !over && endTurn !== setup.color

  const finish = useCallback(
    (reason: Termination) => {
      if (clockRef.current) setClock(stopClock(clockRef.current, now()))
      setTermination(reason)
    },
    [setClock],
  )

  /** Plays at the end of the game and presses the mover's clock. */
  const playMove = useCallback(
    (move: Move | string, mover: Color) =>
      update((g) => {
        g.toEnd()
        if (g.turn() !== mover) return
        const node = g.play(move)
        if (!node) return
        const current = clockRef.current
        if (!current) return
        const pressed = pressClock(current, mover, node.ply, now())
        g.annotate(node, { clock: Math.round(pressed.remaining[mover] / 100) / 10 })
        setClock(g.status(node).kind === 'ongoing' ? pressed : stopClock(pressed, now()))
      }),
    [update, setClock],
  )

  const endFen = end.fen
  useEffect(() => {
    if (!botToMove) return
    const controller = new AbortController()
    const left = clockRef.current && remainingMs(clockRef.current, opposite(setup.color), now())
    const { delayMs } = botBudget(setup.level, left)
    const think = delayMs.min + Math.random() * (delayMs.max - delayMs.min)
    Promise.all([
      play.chooseBotMove({
        fen: endFen,
        level: setup.level,
        random,
        ...(left !== undefined && { remainingMs: left }),
        signal: controller.signal,
      }),
      new Promise((resolve) => setTimeout(resolve, think)),
    ])
      .then(([choice]) => {
        if (controller.signal.aborted) return
        setBotError(undefined)
        setBotWinChance(choice.winChance)
        playMove(choice.move, opposite(setup.color))
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || error instanceof BotMoveCancelledError) return
        setBotError(error instanceof Error ? error.message : String(error))
      })
    return () => controller.abort()
  }, [botToMove, endFen, attempt, play, random, setup.level, setup.color, playMove])

  // Ends the game when the running clock reaches zero.
  useEffect(() => {
    const running = clock?.running
    if (over || !clock || !running) return
    const timer = setTimeout(
      () => {
        const current = clockRef.current
        const loser = current && flagged(current, now())
        if (loser) finish(timeout(endFen, loser))
      },
      remainingMs(clock, running.color, now()) + 10,
    )
    return () => clearTimeout(timer)
  }, [clock, over, endFen, finish])

  // While it's played: after every move, so a game left midway can be resumed.
  const plies = end.ply
  useEffect(() => {
    if (over || plies === 0) return
    enqueueSave(() => play.saveBotGame({ game, setup, record })).catch(() => undefined)
  }, [plies, over, game, setup, record, play, enqueueSave])

  useEffect(() => {
    // A ref, not state: StrictMode runs effects twice, the game must be saved once.
    if (!over || saving.current) return
    saving.current = true
    setSave({ status: 'saving' })
    enqueueSave(() =>
      play.saveBotGame({ game, setup, record, ...(termination && { termination }) }),
    )
      .then((saved) => setSave({ status: 'saved', game: saved }))
      .catch((error: unknown) =>
        setSave({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        }),
      )
  }, [over, game, setup, record, termination, play, enqueueSave])

  return {
    game,
    view,
    update,
    clock,
    over,
    termination,
    botThinking: botToMove && !botError,
    botError,
    retryBot: () => setAttempt((n) => n + 1),
    save,
    /** Plays the user's move (only at the end of the game, on their turn). */
    move: (move: Move) => playMove(move, setup.color),
    resign: () => finish({ reason: 'resignation', loser: setup.color }),
    /** The bot accepts or declines at once; a declined offer can be repeated after a move. */
    offerDraw: () => {
      if (acceptsDraw(botWinChance, end.ply)) finish({ reason: 'agreement' })
      else setDrawDeclinedAt(end.ply)
    },
    drawDeclined: drawDeclinedAt === end.ply,
    /** Takes back the user's last move (and the bot's reply to it). Not in games on a clock. */
    takeback: () =>
      update((g) => {
        g.toEnd()
        if (g.turn() === setup.color) g.takeback()
        g.takeback()
      }),
    // White's first move is ply 1, Black's ply 2.
    canTakeback: !over && !clock && end.ply >= (setup.color === 'white' ? 1 : 2),
  }
}

/**
 * The clock of a game, from the time each side had left after their last move (PGN `[%clk]`);
 * a fresh clock for a new game. It runs again once both sides have moved, paused meanwhile.
 */
function resumedClock(control: TimeControl, game: GameState): ClockState {
  const clock = createClock(control)
  game.toEnd()
  const line = game.line()
  const remaining = { ...clock.remaining }
  for (const node of line) {
    if (node.clock !== undefined)
      remaining[node.ply % 2 === 1 ? 'white' : 'black'] = node.clock * 1000
  }
  const ply = line.at(-1)?.ply ?? 0
  const turn: Color = ply % 2 === 0 ? 'white' : 'black'
  return { control, remaining, ...(ply >= 2 && { running: { color: turn, since: now() } }) }
}
