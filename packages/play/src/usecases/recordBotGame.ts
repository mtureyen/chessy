import { exportPgn, importPgn, type GameState, type MoveNode } from '@chessy/chess'
import { LOCAL_PLAYER_NAME, type GameRepository, type LibraryGame } from '@chessy/library'
import { BOT_LEVELS, botLevel } from '../domain/levels'
import { parsePgnTimeControl, pgnTimeControl, speedOf } from '../domain/timeControl'
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
  /**
   * The game's record when it was saved before (while still being played): saving again
   * updates it instead of adding another game.
   */
  record?: { id: string; startedAt: string }
}

/** PGN tag with the bot's level, so an unfinished game can be resumed against the same bot. */
export const BOT_LEVEL_TAG = 'ChessyBotLevel'

/**
 * Saves a bot game to the library (source 'chessy'), so it can be reviewed later. Also while it
 * is still being played (result "*"), under the same record each time, so it can be resumed.
 */
export async function recordBotGame(
  { repository, newId, now }: RecordBotGameDeps,
  { game, setup, termination, record: earlier }: FinishedBotGame,
): Promise<LibraryGame> {
  const id = earlier?.id ?? newId()
  const playedAt = earlier ? new Date(earlier.startedAt) : now()
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
    [BOT_LEVEL_TAG]: String(setup.level.level),
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

/** A bot game saved while it was still being played, ready to continue. */
export interface UnfinishedBotGame {
  record: LibraryGame
  setup: BotGameSetup
}

/**
 * The most recent bot game that was left unfinished, with the setup to continue it (level and
 * side from its tags, the clock's time control from TimeControl); undefined if there is none.
 */
export async function findUnfinishedBotGame({
  repository,
}: Pick<RecordBotGameDeps, 'repository'>): Promise<UnfinishedBotGame | undefined> {
  const recent = await repository.list({ source: 'chessy', limit: 20 })
  for (const record of recent) {
    if (record.result !== '*') continue
    const { headers } = importPgn(record.pgn)
    const level = Number(headers[BOT_LEVEL_TAG])
    if (!BOT_LEVELS.some((l) => l.level === level)) continue
    const color = record.white.name === LOCAL_PLAYER_NAME ? 'white' : 'black'
    const timeControl = parsePgnTimeControl(headers.TimeControl)
    return { record, setup: { level: botLevel(level), color, ...(timeControl && { timeControl }) } }
  }
  return undefined
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
