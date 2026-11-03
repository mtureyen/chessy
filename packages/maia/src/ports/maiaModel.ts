/** One position for the model: tokens from `encodePosition`, ratings as plain numbers. */
export interface MaiaInput {
  tokens: Float32Array
  /** Rating of the side to move. */
  eloSelf: number
  /** Rating of its opponent. */
  eloOppo: number
}

export interface MaiaOutput {
  /** One logit per vocabulary move (MOVE_COUNT). */
  logits: Float32Array
  /** Loss, draw, win logits for the side to move. */
  value: Float32Array
}

/** Port: runs the Maia-3 network on a batch of positions (ONNX in the browser or in Node). */
export interface MaiaModel {
  run(inputs: readonly MaiaInput[]): Promise<MaiaOutput[]>
}
