import { describe, expect, it } from 'vitest'
import { sampleGame } from '../testing'
import { InvalidUsernameError } from './errors'
import { accountOn, buildProfile, sideOf } from './profile'

const at = { id: 'p1', now: '2026-11-03T21:00:00.000Z' }

describe('buildProfile', () => {
  it('keeps one account per platform and names the profile after the first account', () => {
    const profile = buildProfile(
      {
        accounts: [
          { source: 'chesscom', username: ' 8sly ' },
          { source: 'chesscom', username: 'other' },
          { source: 'lichess', username: 'sly8' },
        ],
      },
      at,
    )
    expect(profile).toEqual({
      id: 'p1',
      displayName: '8sly',
      accounts: [
        { source: 'chesscom', username: '8sly' },
        { source: 'lichess', username: 'sly8' },
      ],
      createdAt: at.now,
      updatedAt: at.now,
    })
    expect(accountOn(profile, 'lichess')?.username).toBe('sly8')
  })

  it('uses a given display name, keeps the creation time and rejects invalid usernames', () => {
    const profile = buildProfile(
      { displayName: 'Sly', accounts: [] },
      { ...at, createdAt: '2026-01-01T00:00:00.000Z' },
    )
    expect(profile).toMatchObject({ displayName: 'Sly', createdAt: '2026-01-01T00:00:00.000Z' })
    expect(() =>
      buildProfile({ accounts: [{ source: 'lichess', username: 'no spaces' }] }, at),
    ).toThrow(InvalidUsernameError)
  })
})

describe('sideOf', () => {
  const profile = buildProfile({ accounts: [{ source: 'chesscom', username: '8Sly' }] }, at)

  it('finds the user by account name, ignoring case', () => {
    const game = sampleGame({
      source: 'chesscom',
      white: { name: 'rival' },
      black: { name: '8sly' },
    })
    expect(sideOf(profile, game)).toBe('black')
    expect(sideOf(profile, sampleGame({ source: 'lichess' }))).toBeUndefined()
  })

  it('finds "You" in games played in Chessy', () => {
    const game = sampleGame({ source: 'chessy', white: { name: 'You' }, black: { name: 'bot' } })
    expect(sideOf(profile, game)).toBe('white')
  })
})
