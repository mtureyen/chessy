import { encodePosition } from '../domain/encoding'
import { decodePrediction, type HumanMovePrediction } from '../domain/prediction'
import type { MaiaModel } from '../ports/maiaModel'

export interface HumanMoveRequest {
  fen: string
  /** Rating of the side to move. */
  eloSelf: number
  /** Rating of its opponent; defaults to the same. */
  eloOppo?: number
}

/**
 * What players of the given ratings would play in each position, as probabilities per legal move.
 * Positions without legal moves get an empty move list. One model run for the whole batch.
 */
export async function predictHumanMoves(
  model: MaiaModel,
  requests: readonly HumanMoveRequest[],
): Promise<HumanMovePrediction[]> {
  const positions = requests.map((request) => encodePosition(request.fen))
  const playable = positions.flatMap((position, i) => (position.legal.length ? [i] : []))
  const outputs = await model.run(
    playable.map((i) => ({
      tokens: positions[i]!.tokens,
      eloSelf: requests[i]!.eloSelf,
      eloOppo: requests[i]!.eloOppo ?? requests[i]!.eloSelf,
    })),
  )
  const predictions: HumanMovePrediction[] = positions.map(() => ({
    moves: [],
    expectedScore: 0.5,
  }))
  for (const [k, i] of playable.entries()) {
    predictions[i] = decodePrediction(positions[i]!, outputs[k]!.logits, outputs[k]!.value)
  }
  return predictions
}
