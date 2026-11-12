import { describe, expect, it } from 'vitest'
import { endReason, gameFacts } from './gameFacts'

const pgn = (termination: string | undefined, result: string, moves: string) =>
  [
    '[White "alice"]',
    '[Black "bob"]',
    `[Result "${result}"]`,
    ...(termination === undefined ? [] : [`[Termination "${termination}"]`]),
    '',
    `${moves} ${result}`,
  ].join('\n')

const MATE = '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#'
const SHORT = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'
// The start position a third time after 2...Ng8 4...Ng8.
const REPEAT = '1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8'

describe('gameFacts', () => {
  it('keeps the first moves, the length and how it ended', () => {
    expect(gameFacts(pgn('Normal', '1-0', MATE), '1-0')).toEqual({
      plies: 7,
      moves: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'],
      end: 'checkmate',
    })
  })

  it('keeps at most eight half-moves', () => {
    expect(gameFacts(pgn('Normal', '1/2-1/2', REPEAT), '1/2-1/2')?.moves).toHaveLength(8)
  })

  it('is undefined for a PGN it cannot read', () => {
    expect(gameFacts('1. e4 e5 2. Ke3 Ke6 3. Qxh7', '1-0')).toBeUndefined()
  })
})

describe('endReason (from the tag, else the board)', () => {
  const read = (
    termination: string | undefined,
    result: '1-0' | '0-1' | '1/2-1/2',
    moves: string,
  ) => gameFacts(pgn(termination, result, moves), result)?.end

  it("reads chess.com's reasons", () => {
    expect(read('Hikaru won by resignation', '0-1', SHORT)).toBe('resignation')
    expect(read('Hikaru won by checkmate', '1-0', MATE)).toBe('checkmate')
    expect(read('Hikaru won on time', '1-0', SHORT)).toBe('time')
    expect(read('Hikaru won - game abandoned', '1-0', SHORT)).toBe('abandoned')
    expect(read('Game drawn by agreement', '1/2-1/2', SHORT)).toBe('agreement')
    expect(read('Game drawn by repetition', '1/2-1/2', SHORT)).toBe('repetition')
    expect(read('Game drawn by stalemate', '1/2-1/2', SHORT)).toBe('stalemate')
    expect(read('Game drawn by insufficient material', '1/2-1/2', SHORT)).toBe(
      'insufficient-material',
    )
    expect(read('Game drawn by 50-move rule', '1/2-1/2', SHORT)).toBe('fifty-move-rule')
    expect(read('Game drawn by timeout vs insufficient material', '1/2-1/2', SHORT)).toBe(
      'timeout-vs-insufficient',
    )
  })

  it('tells lichess\'s "Normal" endings apart by the final position', () => {
    expect(read('Normal', '1-0', MATE)).toBe('checkmate')
    expect(read('Normal', '0-1', SHORT)).toBe('resignation')
    expect(read('Normal', '1/2-1/2', REPEAT)).toBe('repetition')
    expect(read('Normal', '1/2-1/2', SHORT)).toBe('agreement')
    expect(read('Time forfeit', '0-1', SHORT)).toBe('time')
    expect(read('Abandoned', '1-0', SHORT)).toBe('abandoned')
    expect(read('Rules infraction', '1-0', SHORT)).toBe('other')
  })

  it('without a tag only the board can tell', () => {
    expect(read(undefined, '1-0', MATE)).toBe('checkmate')
    expect(read(undefined, '1-0', SHORT)).toBe('other')
  })

  it('takes a mate on the board over the tag', () => {
    expect(endReason('Time forfeit', { kind: 'checkmate', winner: 'white' }, '1-0')).toBe(
      'checkmate',
    )
    // The winner's name is not what tells.
    expect(endReason('checkmate_bro won on time', { kind: 'ongoing' }, '1-0')).toBe('time')
    expect(endReason('resigner99 won by checkmate', { kind: 'ongoing' }, '0-1')).toBe('checkmate')
    expect(endReason('time_lord won by resignation', { kind: 'ongoing' }, '1-0')).toBe(
      'resignation',
    )
  })
})
