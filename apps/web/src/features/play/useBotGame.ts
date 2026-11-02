import type { Color } from '@chessy/chess'
import type { LibraryGame } from '@chessy/library'
import { BotMoveCancelledError, seededRandom, type BotGameSetup } from '@chessy/play'
import { useEffect, useRef, useState } from 'react'
import { useServices } from '@/app/servicesContext'
import { useGame } from '@/shared/game/useGame'

/** The bot waits at least this long before moving, so its replies don't land instantly. */
const THINK_MS = { min: 350, max: 900 }

export type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; game: LibraryGame }
  | { status: 'error'; message: string }

/**
 * A game against the bot. The bot answers whenever it is to move at the end of the game (not
 * while the user looks back at earlier moves); a finished or resigned game is saved once.
 */
export function useBotGame(setup: BotGameSetup, seed: number) {
  const { play } = useServices()
  const { game, view, update } = useGame({ freezeWhenOver: true })
  const [random] = useState(() => seededRandom(seed))
  const [resigned, setResigned] = useState<Color>()
  const [botError, setBotError] = useState<string>()
  const [attempt, setAttempt] = useState(0)
  const [save, setSave] = useState<SaveState>({ status: 'idle' })
  const saving = useRef(false)

  const over = view.status.kind !== 'ongoing' || resigned !== undefined
  const botToMove = !over && view.atEnd && view.turn !== setup.color
  const position = view.current.id

  useEffect(() => {
    if (!botToMove) return
    const controller = new AbortController()
    const fen = game.fen()
    const think = THINK_MS.min + Math.random() * (THINK_MS.max - THINK_MS.min)
    Promise.all([
      play.chooseBotMove({ fen, level: setup.level, random, signal: controller.signal }),
      new Promise((resolve) => setTimeout(resolve, think)),
    ])
      .then(([choice]) => {
        if (controller.signal.aborted) return
        setBotError(undefined)
        update((g) => g.fen() === fen && g.play(choice.move))
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || error instanceof BotMoveCancelledError) return
        setBotError(error instanceof Error ? error.message : String(error))
      })
    return () => controller.abort()
  }, [botToMove, position, attempt, game, play, random, setup.level, update])

  useEffect(() => {
    // A ref, not state: StrictMode runs effects twice, the game must be saved once.
    if (!over || saving.current) return
    saving.current = true
    setSave({ status: 'saving' })
    play
      .saveBotGame({ game, setup, ...(resigned && { resigned }) })
      .then((saved) => setSave({ status: 'saved', game: saved }))
      .catch((error: unknown) =>
        setSave({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        }),
      )
  }, [over, game, setup, resigned, play])

  /** Takes back the user's last move (and the bot's reply to it). */
  const takeback = () =>
    update((g) => {
      g.toEnd()
      if (g.turn() === setup.color) g.takeback()
      g.takeback()
    })

  return {
    game,
    view,
    update,
    over,
    resigned,
    botThinking: botToMove && !botError,
    botError,
    retryBot: () => setAttempt((n) => n + 1),
    save,
    resign: () => setResigned(setup.color),
    takeback,
    // Bot games start from the initial position: White's first move is ply 1, Black's ply 2.
    canTakeback: !over && view.line.length >= (setup.color === 'white' ? 1 : 2),
  }
}
