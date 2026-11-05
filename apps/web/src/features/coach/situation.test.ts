import { createGame } from '@chessy/chess'
import { buildProfile } from '@chessy/library'
import { describe, expect, it } from 'vitest'
import { findPosition, samePosition, usualRating, userRating } from './situation'

describe('findPosition', () => {
  it('finds a position on the main line or in a variation, ignoring move counters', () => {
    const game = createGame()
    game.play('e2e4')
    game.play('e7e5')
    const afterE4 = game.root.children[0]!
    game.goTo(afterE4)
    game.play('c7c5') // a variation
    const sicilian = afterE4.children[1]!
    expect(findPosition(game.root, sicilian.fen)).toBe(sicilian)
    expect(findPosition(game.root, afterE4.fen.replace(/ 0 1$/, ' 7 9'))).toBe(afterE4)
    expect(findPosition(game.root, '8/8/8/8/8/2k5/1q6/4K3 b - - 0 1')).toBeUndefined()
    expect(samePosition(afterE4.fen, sicilian.fen)).toBe(false)
  })
})

describe('userRating', () => {
  const profile = buildProfile(
    { accounts: [{ source: 'chesscom', username: '8sly' }] },
    { id: 'p', now: '2026-11-05T00:00:00.000Z' },
  )

  it('takes the rating of the side the user played', () => {
    const headers = { White: 'rival', Black: '8SLY', WhiteElo: '900', BlackElo: '780' }
    expect(userRating(headers, profile)).toBe(780)
    expect(userRating({ White: 'You', WhiteElo: '1200' }, null)).toBe(1200)
  })

  it('has none for games the user did not play or without ratings', () => {
    expect(userRating({ White: 'a', Black: 'b', WhiteElo: '900' }, profile)).toBeUndefined()
    expect(userRating({ White: '8sly', WhiteElo: '?' }, profile)).toBeUndefined()
  })
})

describe('usualRating', () => {
  it('prefers rapid, then classical, blitz and bullet', () => {
    expect(usualRating({ blitz: 447, rapid: 790, bullet: 455 })).toBe(790)
    expect(usualRating({ bullet: 455, blitz: 447 })).toBe(447)
    expect(usualRating({})).toBeUndefined()
  })
})
