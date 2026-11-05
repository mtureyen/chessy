import { positionKey } from '@chessy/analysis'
import type { MoveNode, PgnHeaders } from '@chessy/chess'
import { LOCAL_PLAYER_NAME, type PlayerProfile, type Profile } from '@chessy/library'

/** The longest game the coach is sent (the API's limit); a longer one goes without its PGN. */
export const MAX_PGN_LENGTH = 20_000

/** Whether two FENs are the same position (move counters aside). */
export function samePosition(a: string, b: string): boolean {
  return positionKey(a) === positionKey(b)
}

/** The node of the game (main line or a variation) with this position, nearest the start. */
export function findPosition(root: MoveNode, fen: string): MoveNode | undefined {
  const queue: MoveNode[] = [root]
  for (let node = queue.shift(); node; node = queue.shift()) {
    if (samePosition(node.fen, fen)) return node
    queue.push(...node.children)
  }
  return undefined
}

/** The user's rating in the game (WhiteElo/BlackElo of the side they played), if they played it. */
export function userRating(
  headers: PgnHeaders,
  profile: Profile | null | undefined,
): number | undefined {
  const names = [LOCAL_PLAYER_NAME, ...(profile?.accounts.map((a) => a.username) ?? [])].map(
    (name) => name.toLowerCase(),
  )
  const side = (['White', 'Black'] as const).find((tag) =>
    names.includes((headers[tag] ?? '').toLowerCase()),
  )
  const rating = side && Number(headers[`${side}Elo`])
  return rating && Number.isInteger(rating) && rating >= 100 && rating <= 3500 ? rating : undefined
}

/** The speeds whose rating best tells a player's level, in order of preference. */
const LEVEL_SPEEDS = ['rapid', 'classical', 'blitz', 'bullet'] as const

/** A player's usual level from their platform ratings: rapid first, bullet last. */
export function usualRating(ratings: PlayerProfile['ratings']): number | undefined {
  return LEVEL_SPEEDS.map((speed) => ratings[speed]).find((rating) => rating !== undefined)
}
