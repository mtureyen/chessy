/** A position and the ratings of the side to move and its opponent. */
export interface HumanMoveRequest {
  fen: string
  eloSelf: number
  eloOppo: number
}

export interface HumanMoveDistribution {
  /** Legal moves (UCI) with how likely a player of `eloSelf` plays each, most likely first. */
  moves: { move: string; probability: number }[]
  /** The result humans of these ratings tend to get from here, for the side to move: 0–1. */
  expectedScore: number
}

/**
 * Port: what a human of a given rating would play in a position (e.g. Maia). Human-like bot
 * levels sample their moves from it.
 */
export interface HumanMovePolicy {
  /** E.g. "Maia-3". */
  readonly name: string
  predict(request: HumanMoveRequest): Promise<HumanMoveDistribution>
}
