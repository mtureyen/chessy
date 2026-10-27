import { describe, expect, it } from 'vitest'
import { sampleGame } from '../testing'
import { isValidUsername, outcomeFor } from './game'

describe('outcomeFor', () => {
  it('reads the result from the given player’s side, ignoring case', () => {
    const game = sampleGame({ white: { name: 'Alice' }, black: { name: 'Bob' }, result: '1-0' })
    expect(outcomeFor(game, 'alice')).toBe('win')
    expect(outcomeFor(game, 'BOB')).toBe('loss')
    expect(outcomeFor({ ...game, result: '1/2-1/2' }, 'bob')).toBe('draw')
    expect(outcomeFor({ ...game, result: '*' }, 'alice')).toBe('unknown')
    expect(outcomeFor(game, 'carol')).toBe('unknown')
  })
})

describe('isValidUsername', () => {
  it('accepts platform-style names only', () => {
    expect(['DrNykterstein', 'Zhigalko_Sergei', 'a-b', 'ab'].every(isValidUsername)).toBe(true)
    expect(['a', 'with space', 'x'.repeat(31), 'drop;table', ''].some(isValidUsername)).toBe(false)
  })
})
