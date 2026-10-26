import { describe, expect, it } from 'vitest'
import { goCommand, parseBestMove, parseInfo } from './uci'

describe('parseInfo', () => {
  it('parses a full Stockfish line', () => {
    const line =
      'info depth 18 seldepth 24 multipv 2 score cp -31 nodes 812345 nps 1023456 hashfull 120 tbhits 0 time 794 pv e7e5 g1f3 b8c6'
    expect(parseInfo(line)).toEqual({
      depth: 18,
      seldepth: 24,
      multipv: 2,
      score: { type: 'cp', value: -31 },
      nodes: 812345,
      nps: 1023456,
      timeMs: 794,
      pv: ['e7e5', 'g1f3', 'b8c6'],
    })
  })

  it('parses mate scores, bounds and WDL', () => {
    expect(parseInfo('info depth 9 score mate -3 pv a1a2')?.score).toEqual({
      type: 'mate',
      value: -3,
    })
    expect(parseInfo('info depth 20 score cp 44 lowerbound nodes 1 pv e2e4')?.score).toEqual({
      type: 'cp',
      value: 44,
      bound: 'lower',
    })
    const wdl = parseInfo('info depth 12 score cp 20 wdl 120 820 60 nodes 99 pv d2d4')
    expect(wdl).toMatchObject({ depth: 12, nodes: 99, pv: ['d2d4'] })
  })

  it('defaults multipv to 1 and handles lines without pv', () => {
    expect(parseInfo('info depth 1 currmove e2e4 currmovenumber 1')).toEqual({
      depth: 1,
      multipv: 1,
      pv: [],
    })
    expect(parseInfo('info depth 0 score mate 0')).toEqual({
      depth: 0,
      multipv: 1,
      score: { type: 'mate', value: 0 },
      pv: [],
    })
  })

  it('ignores info strings and non-info lines', () => {
    expect(parseInfo('info string NNUE evaluation using nn-xyz.nnue enabled')).toBeUndefined()
    expect(parseInfo('bestmove e2e4')).toBeUndefined()
    expect(parseInfo('readyok')).toBeUndefined()
  })
})

describe('parseBestMove', () => {
  it('parses best move, ponder and (none)', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toEqual({ move: 'e2e4', ponder: 'e7e5' })
    expect(parseBestMove('bestmove a7a8q')).toEqual({ move: 'a7a8q' })
    expect(parseBestMove('bestmove (none)')).toEqual({ move: undefined })
    expect(parseBestMove('info depth 1')).toBeUndefined()
  })
})

describe('goCommand', () => {
  it('builds limits and falls back to infinite', () => {
    expect(goCommand({})).toBe('go infinite')
    expect(goCommand({ depth: 18 })).toBe('go depth 18')
    expect(goCommand({ movetimeMs: 300, nodes: 1e6 })).toBe('go movetime 300 nodes 1000000')
  })
})
