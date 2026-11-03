import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { OnnxMaiaModel } from '@chessy/maia'
import * as ort from 'onnxruntime-web'
import { MaiaHumanMoveService, type HumanMoveService } from './service'

/** Where `bun run maia:fetch` puts the model. */
export const BUNDLED_MAIA = fileURLToPath(
  new URL('../../../.maia/maia3_simplified.onnx', import.meta.url),
)

/**
 * Maia-3 on onnxruntime's WebAssembly backend (the same runtime a browser would use), one
 * thread. Reports itself unavailable until the model file exists.
 */
export function createMaiaService(path: string = BUNDLED_MAIA): HumanMoveService {
  return new MaiaHumanMoveService(async () => {
    if (!existsSync(path)) throw new Error(`No Maia model at ${path} (bun run maia:fetch)`)
    ort.env.wasm.numThreads = 1
    // 'basic' as the Maia platform found: 'all' shifts the probabilities slightly.
    const session = await ort.InferenceSession.create(path, { graphOptimizationLevel: 'basic' })
    return new OnnxMaiaModel(ort, session)
  })
}
