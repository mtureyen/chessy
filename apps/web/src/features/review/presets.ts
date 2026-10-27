/**
 * Review quality = node budget per position (same result on every device). Measured with
 * Stockfish 19 lite in Chrome on an M4 Pro: ~1.3M nodes/s, so Standard takes ~0.4 s per move
 * there and roughly 2–3× longer on an average laptop.
 */
export const REVIEW_PRESETS = [
  { id: 'fast', label: 'Fast', nodes: 150_000 },
  { id: 'standard', label: 'Standard', nodes: 500_000 },
  { id: 'deep', label: 'Deep', nodes: 1_500_000 },
] as const

export type ReviewPresetId = (typeof REVIEW_PRESETS)[number]['id']

export function presetNodes(id: ReviewPresetId): number {
  return REVIEW_PRESETS.find((p) => p.id === id)!.nodes
}
