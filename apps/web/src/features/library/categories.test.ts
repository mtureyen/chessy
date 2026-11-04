import { sampleGame } from '@chessy/library/testing'
import { describe, expect, it } from 'vitest'
import { categoryOf } from './categories'

describe('categoryOf', () => {
  it('keeps platform games by platform and splits games played here', () => {
    expect(categoryOf(sampleGame({ source: 'chesscom' }))).toBe('chesscom')
    expect(categoryOf(sampleGame({ source: 'lichess' }))).toBe('lichess')
    const bot = sampleGame({
      source: 'chessy',
      white: { name: 'Chessy bot (level 3)' },
      black: { name: 'You' },
    })
    expect(categoryOf(bot)).toBe('bot')
    const local = sampleGame({
      source: 'chessy',
      white: { name: 'White' },
      black: { name: 'Black' },
    })
    expect(categoryOf(local)).toBe('local')
  })
})
