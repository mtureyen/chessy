import { describe, expect, it } from 'vitest'
import { acceptsDraw, resultOf, timeout } from './session'

const ONGOING = { kind: 'ongoing' } as const

describe('resultOf', () => {
  it('takes how the game was ended over the position', () => {
    expect(resultOf(ONGOING)).toBe('*')
    expect(resultOf({ kind: 'checkmate', winner: 'black' })).toBe('0-1')
    expect(resultOf(ONGOING, { reason: 'resignation', loser: 'black' })).toBe('1-0')
    expect(resultOf(ONGOING, { reason: 'timeout', loser: 'white', draw: false })).toBe('0-1')
    expect(resultOf(ONGOING, { reason: 'timeout', loser: 'white', draw: true })).toBe('1/2-1/2')
    expect(resultOf(ONGOING, { reason: 'agreement' })).toBe('1/2-1/2')
  })
})

describe('timeout', () => {
  it('is a draw when the opponent could never mate', () => {
    const bareKingVsQueen = '4k3/8/8/8/8/8/8/3QK3 b - - 0 1'
    expect(timeout(bareKingVsQueen, 'white')).toMatchObject({ draw: true })
    expect(timeout(bareKingVsQueen, 'black')).toMatchObject({ draw: false })
  })
})

describe('acceptsDraw', () => {
  it('accepts when the bot stands worse, or a long game is about even', () => {
    expect(acceptsDraw(undefined, 80)).toBe(false)
    expect(acceptsDraw(30, 10)).toBe(true)
    expect(acceptsDraw(50, 20)).toBe(false)
    expect(acceptsDraw(50, 60)).toBe(true)
    expect(acceptsDraw(70, 90)).toBe(false)
  })
})
