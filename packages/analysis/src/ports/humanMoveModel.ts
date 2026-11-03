/** One played move to rate: how likely would a player of this rating have chosen it? */
export interface HumanMoveQuery {
  /** The position before the move. */
  fen: string
  /** UCI. */
  move: string
  /** Rating of the player who moved, and of the opponent. */
  eloSelf: number
  eloOppo: number
}

/**
 * Port: how likely humans of a given rating play a move (e.g. Maia). The review uses it to tell
 * hard-to-find moves from ones most players would play anyway.
 */
export interface HumanMoveModel {
  /** One probability (0–1) per query, in order. */
  moveProbabilities(queries: readonly HumanMoveQuery[]): Promise<number[]>
}
