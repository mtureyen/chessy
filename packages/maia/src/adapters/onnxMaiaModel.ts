import { MOVE_COUNT } from '../domain/encoding'
import type { MaiaInput, MaiaModel, MaiaOutput } from '../ports/maiaModel'

/** The parts of onnxruntime (web or node) this adapter uses, so the package doesn't depend on it. */
export interface OnnxRuntime {
  Tensor: new (type: 'float32', data: Float32Array, dims: readonly number[]) => unknown
}

export interface OnnxSession {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: unknown }>>
}

/**
 * MaiaModel over an ONNX session of `maia3_simplified.onnx`: inputs `tokens` [B, 64, 12],
 * `elo_self` [B], `elo_oppo` [B]; outputs `logits_move` [B, 4352], `logits_value` [B, 3].
 */
export class OnnxMaiaModel implements MaiaModel {
  private readonly ort: OnnxRuntime
  private readonly session: OnnxSession

  constructor(ort: OnnxRuntime, session: OnnxSession) {
    this.ort = ort
    this.session = session
  }

  async run(inputs: readonly MaiaInput[]): Promise<MaiaOutput[]> {
    if (inputs.length === 0) return []
    const batch = inputs.length
    const tokens = new Float32Array(batch * 64 * 12)
    for (const [i, input] of inputs.entries()) tokens.set(input.tokens, i * 64 * 12)
    const tensor = (data: Float32Array, dims: number[]) =>
      new this.ort.Tensor('float32', data, dims)
    const result = await this.session.run({
      tokens: tensor(tokens, [batch, 64, 12]),
      elo_self: tensor(
        Float32Array.from(inputs, (input) => input.eloSelf),
        [batch],
      ),
      elo_oppo: tensor(
        Float32Array.from(inputs, (input) => input.eloOppo),
        [batch],
      ),
    })
    const logits = result.logits_move?.data as Float32Array
    const value = result.logits_value?.data as Float32Array
    if (!logits || !value) throw new Error('Maia model returned no logits')
    return inputs.map((_, i) => ({
      logits: logits.subarray(i * MOVE_COUNT, (i + 1) * MOVE_COUNT),
      value: value.subarray(i * 3, i * 3 + 3),
    }))
  }
}
