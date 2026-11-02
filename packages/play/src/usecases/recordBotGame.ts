import { exportPgn, type GameState, type MoveNode } from '@chessy/chess'
import { LOCAL_PLAYER_NAME, type GameRepository, type LibraryGame } from '@chessy/library'
import { pgnTimeControl, speedOf } from '../domain/timeControl'
import { botName, opposite, resultOf, type BotGameSetup, type Termination } from '../domain/session'

export interface RecordBotGameDeps {
  repository: GameRepository
  newId: () => string
  now: () => Date
}

export interface FinishedBotGame {
  game: GameState
  setup: BotGameSetup
  /** How the game ended, unless on the board. */
  termination?: Termination
}

/** Saves a bot game to the library (source 'chessy'), so it can be reviewed later. */
export async function recordBotGame(
  { repository, newId, now }: RecordBotGameDeps,
  { game, setup, termination }: FinishedBotGame,
): Promise<LibraryGame> {
  const id = newId()
  const playedAt = now()
  const user = { name: LOCAL_PLAYER_NAME }
  const bot = { name: botName(setup.level) }
  const players =
    setup.color === 'white' ? { white: user, black: bot } : { white: bot, black: user }
  const result = resultOf(game.status(mainlineEnd(game.root)), termination)
  const { timeControl } = setup
  // exportPgn fills in Result for a finished position; other endings have to be stated.
  const pgn = exportPgn(game, {
    Result: result,
    Event: `Casual game vs ${botName(setup.level)}`,
    Site: 'Chessy',
    Date: pgnDate(playedAt),
    White: players.white.name,
    Black: players.black.name,
    ...(timeControl && { TimeControl: pgnTimeControl(timeControl) }),
    ...(termination && { Termination: describe(termination, players) }),
  })
  const record: LibraryGame = {
    id,
    source: 'chessy',
    externalId: id,
    pgn,
    white: players.white,
    black: players.black,
    result,
    speed: timeControl ? speedOf(timeControl) : 'unlimited',
    ...(timeControl && { timeControl: pgnTimeControl(timeControl) }),
    rated: false,
    playedAt: playedAt.toISOString(),
    importedAt: playedAt.toISOString(),
  }
  await repository.saveAll([record])
  return record
}

function mainlineEnd(root: MoveNode): MoveNode {
  let node = root
  while (node.children[0]) node = node.children[0]
  return node
}

/** PGN Termination in words, the way chess.com writes it ("You won on time"). */
function describe(
  termination: Termination,
  players: Record<'white' | 'black', { name: string }>,
): string {
  if (termination.reason === 'agreement') return 'Game drawn by agreement'
  if (termination.reason === 'timeout' && termination.draw)
    return 'Game drawn by timeout vs insufficient material'
  const winner = players[opposite(termination.loser)].name
  return `${winner} won ${termination.reason === 'timeout' ? 'on time' : 'by resignation'}`
}

/** PGN dates are "YYYY.MM.DD" (UTC here). */
function pgnDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll('-', '.')
}
