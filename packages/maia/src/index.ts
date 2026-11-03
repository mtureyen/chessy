/**
 * Maia context: Maia-3 (CSSLab, AGPL-3.0), a network that predicts the move a human of a given
 * rating would play. Runtime-neutral: the ONNX runtime comes in from the app.
 */
export {
  MOVE_COUNT,
  encodePosition,
  mirrorMove,
  mirrorSquare,
  moveAt,
  moveIndex,
  type EncodedPosition,
} from './domain/encoding'
export { decodePrediction, type HumanMove, type HumanMovePrediction } from './domain/prediction'
export type { MaiaInput, MaiaModel, MaiaOutput } from './ports/maiaModel'
export {
  moveProbabilities,
  predictHumanMoves,
  type HumanMoveRequest,
  type MoveProbabilityQuery,
} from './usecases/predictHumanMoves'
export { OnnxMaiaModel, type OnnxRuntime, type OnnxSession } from './adapters/onnxMaiaModel'
