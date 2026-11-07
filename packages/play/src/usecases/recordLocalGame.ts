import { exportPgn, type GameState, type MoveNode, type PgnHeaders } from '@chessy/chess'
import type { GameRepository, LibraryGame } from '@chessy/library'
import { resultOf } from '../domain/session'

/** Player names of a game two people played on one board here. */
export const LOCAL_PLAYERS = { white: 'White', black: 'Black' } as const

export interface LocalGame {
  game: GameState
  /** Headers the game came with (e.g. from a pasted PGN); ours win for players and site. */
  headers?: PgnHeaders
  /** The record when the game was saved before: saving again updates it. */
  record?: { id: string; startedAt: string }
}

/**
 * Saves a game played on the local board (source 'chessy'), finished or not ("*"). Under the
 * same record each time, so a game saved midway and again at the end stays one game.
 */
export async function recordLocalGame(
  { repository, newId, now }: { repository: GameRepository; newId: () => string; now: () => Date },
  { game, headers = {}, record: earlier }: LocalGame,
): Promise<LibraryGame> {
  const id = earlier?.id ?? newId()
  const startedAt = earlier ? new Date(earlier.startedAt) : now()
  const result = resultOf(game.status(mainlineEnd(game.root)))
  const pgn = exportPgn(game, {
    ...headers,
    Result: result,
    Event: 'Local game',
    Site: 'pawnia',
    Date: startedAt.toISOString().slice(0, 10).replaceAll('-', '.'),
    White: LOCAL_PLAYERS.white,
    Black: LOCAL_PLAYERS.black,
  })
  const saved: LibraryGame = {
    id,
    source: 'chessy',
    externalId: id,
    pgn,
    white: { name: LOCAL_PLAYERS.white },
    black: { name: LOCAL_PLAYERS.black },
    result,
    speed: 'unlimited',
    rated: false,
    playedAt: startedAt.toISOString(),
    importedAt: startedAt.toISOString(),
  }
  await repository.saveAll([saved])
  return saved
}

function mainlineEnd(root: MoveNode): MoveNode {
  let node = root
  while (node.children[0]) node = node.children[0]
  return node
}
