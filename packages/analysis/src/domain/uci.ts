import type { RelativeScore } from './score'

/** One parsed `info` line. Scores are relative to the side to move, as UCI sends them. */
export interface UciInfo {
  depth?: number
  seldepth?: number
  multipv: number
  score?: RelativeScore & { bound?: 'lower' | 'upper' }
  nodes?: number
  nps?: number
  timeMs?: number
  pv: string[]
}

export interface UciBestMove {
  /** Undefined when the position has no legal moves (`bestmove (none)`). */
  move: string | undefined
  ponder?: string
}

const NUMERIC_KEYS = {
  depth: 'depth',
  seldepth: 'seldepth',
  multipv: 'multipv',
  nodes: 'nodes',
  nps: 'nps',
  time: 'timeMs',
} as const

/** Keys whose value runs to the end of the line. */
const REST_OF_LINE = new Set(['pv', 'string', 'refutation', 'currline'])
/** Keys followed by a fixed number of values we don't use. */
const SKIP_VALUES: Record<string, number> = {
  currmove: 1,
  currmovenumber: 1,
  hashfull: 1,
  tbhits: 1,
  cpuload: 1,
  sbhits: 1,
  wdl: 3,
}

/** Parses a UCI `info` line. Returns undefined for other lines and for `info string`. */
export function parseInfo(line: string): UciInfo | undefined {
  const tokens = line.trim().split(/\s+/)
  if (tokens[0] !== 'info') return undefined

  const info: UciInfo = { multipv: 1, pv: [] }
  for (let i = 1; i < tokens.length; i++) {
    const key = tokens[i]!
    if (key in NUMERIC_KEYS) {
      const value = Number(tokens[++i])
      if (Number.isFinite(value)) info[NUMERIC_KEYS[key as keyof typeof NUMERIC_KEYS]] = value
    } else if (key === 'score') {
      const type = tokens[++i]
      const value = Number(tokens[++i])
      if ((type === 'cp' || type === 'mate') && Number.isFinite(value)) info.score = { type, value }
      const bound = tokens[i + 1]
      if (info.score && (bound === 'lowerbound' || bound === 'upperbound')) {
        info.score.bound = bound === 'lowerbound' ? 'lower' : 'upper'
        i++
      }
    } else if (REST_OF_LINE.has(key)) {
      if (key === 'string') return undefined
      if (key === 'pv') info.pv = tokens.slice(i + 1)
      break
    } else {
      i += SKIP_VALUES[key] ?? 1
    }
  }
  return info
}

/** Parses `bestmove e2e4 [ponder e7e5]` / `bestmove (none)`. */
export function parseBestMove(line: string): UciBestMove | undefined {
  const tokens = line.trim().split(/\s+/)
  if (tokens[0] !== 'bestmove') return undefined
  const move = tokens[1] && tokens[1] !== '(none)' ? tokens[1] : undefined
  const ponder = tokens[2] === 'ponder' ? tokens[3] : undefined
  return ponder ? { move, ponder } : { move }
}

export interface SearchLimits {
  depth?: number
  movetimeMs?: number
  nodes?: number
}

/** Builds the `go` command. Without limits the search runs until `stop`. */
export function goCommand(limits: SearchLimits): string {
  const parts = ['go']
  if (limits.depth !== undefined) parts.push('depth', String(limits.depth))
  if (limits.movetimeMs !== undefined) parts.push('movetime', String(limits.movetimeMs))
  if (limits.nodes !== undefined) parts.push('nodes', String(limits.nodes))
  if (parts.length === 1) parts.push('infinite')
  return parts.join(' ')
}
