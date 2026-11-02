import { exportPgn, type Color, type GameState, type MoveNode } from '@chessy/chess'
import { LOCAL_PLAYER_NAME, type GameRepository, type LibraryGame } from '@chessy/library'
import { botName, resultOf, type BotGameSetup } from '../domain/session'

export interface RecordBotGameDeps {
  repository: GameRepository
  newId: () => string
  now: () => Date
}

export interface FinishedBotGame {
  game: GameState
  setup: BotGameSetup
  /** The side that resigned, if the game ended that way. */
  resigned?: Color
}

/** Saves a bot game to the library (source 'chessy'), so it can be reviewed later. */
export async function recordBotGame(
  { repository, newId, now }: RecordBotGameDeps,
  { game, setup, resigned }: FinishedBotGame,
): Promise<LibraryGame> {
  const id = newId()
  const playedAt = now()
  const user = { name: LOCAL_PLAYER_NAME }
  const bot = { name: botName(setup.level) }
  const players =
    setup.color === 'white' ? { white: user, black: bot } : { white: bot, black: user }
  const result = resultOf(game.status(mainlineEnd(game.root)), resigned)
  // exportPgn fills in Result for a finished position; a resignation has to be stated.
  const pgn = exportPgn(game, {
    Result: result,
    Event: `Casual game vs ${botName(setup.level)}`,
    Site: 'Chessy',
    Date: pgnDate(playedAt),
    White: players.white.name,
    Black: players.black.name,
    ...(resigned && { Termination: `${capitalize(resigned)} resigned` }),
  })
  const record: LibraryGame = {
    id,
    source: 'chessy',
    externalId: id,
    pgn,
    white: players.white,
    black: players.black,
    result,
    speed: 'unlimited',
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

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** PGN dates are "YYYY.MM.DD" (UTC here). */
function pgnDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll('-', '.')
}
