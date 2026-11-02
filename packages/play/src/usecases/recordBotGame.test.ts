import { createGame, importPgn } from '@chessy/chess'
import { InMemoryGameRepository } from '@chessy/library'
import { describe, expect, it } from 'vitest'
import { botLevel } from '../domain/levels'
import { recordBotGame } from './recordBotGame'

function foolsMate() {
  const game = createGame()
  for (const san of ['f3', 'e5', 'g4', 'Qh4#']) game.play(san)
  return game
}

const deps = (repository = new InMemoryGameRepository()) => ({
  repository,
  newId: () => 'game-1',
  now: () => new Date('2026-11-02T20:15:00Z'),
})

describe('recordBotGame', () => {
  it('saves the game with the user and the bot on the right sides', async () => {
    const repository = new InMemoryGameRepository()
    const saved = await recordBotGame(deps(repository), {
      game: foolsMate(),
      setup: { level: botLevel(3), color: 'white' },
    })
    expect(saved).toMatchObject({
      id: 'game-1',
      source: 'chessy',
      externalId: 'game-1',
      white: { name: 'You' },
      black: { name: 'Chessy bot (level 3)' },
      result: '0-1',
      speed: 'unlimited',
      rated: false,
      playedAt: '2026-11-02T20:15:00.000Z',
    })
    expect(saved.url).toBeUndefined()
    expect(await repository.get('game-1')).toEqual(saved)

    const { game, headers } = importPgn(saved.pgn)
    expect(game.line().map((n) => n.move?.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#'])
    expect(headers).toMatchObject({
      White: 'You',
      Black: 'Chessy bot (level 3)',
      Result: '0-1',
      Date: '2026.11.02',
      Site: 'Chessy',
    })
  })

  it('records an unfinished game as "*"', async () => {
    const game = createGame()
    game.play('e4')
    const saved = await recordBotGame(deps(), {
      game,
      setup: { level: botLevel(1), color: 'black' },
    })
    expect(saved.result).toBe('*')
    expect(saved.white.name).toBe('Chessy bot (level 1)')
  })

  it('records a resignation as a loss for the side that resigned', async () => {
    const game = createGame()
    game.play('e4')
    const saved = await recordBotGame(deps(), {
      game,
      setup: { level: botLevel(2), color: 'black' },
      resigned: 'black',
    })
    expect(saved.result).toBe('1-0')
    expect(importPgn(saved.pgn).headers).toMatchObject({
      Result: '1-0',
      Termination: 'Black resigned',
    })
  })
})
