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
      termination: { reason: 'resignation', loser: 'black' },
    })
    expect(saved.result).toBe('1-0')
    expect(importPgn(saved.pgn).headers).toMatchObject({
      Result: '1-0',
      Termination: 'Chessy bot (level 2) won by resignation',
    })
  })

  it('records the time control, the speed, the clocks and a loss on time', async () => {
    const game = createGame()
    game.annotate(game.play('e4')!, { clock: 180 })
    game.annotate(game.play('e5')!, { clock: 178.5 })
    const saved = await recordBotGame(deps(), {
      game,
      setup: {
        level: botLevel(5),
        color: 'white',
        timeControl: { initialMs: 180_000, incrementMs: 2000 },
      },
      termination: { reason: 'timeout', loser: 'black', draw: false },
    })
    expect(saved).toMatchObject({ result: '1-0', speed: 'blitz', timeControl: '180+2' })
    const imported = importPgn(saved.pgn)
    expect(imported.headers).toMatchObject({ TimeControl: '180+2', Termination: 'You won on time' })
    expect(imported.game.line().map((node) => node.clock)).toEqual([180, 178.5])
  })

  it('records draws by agreement and by timeout against a bare king', async () => {
    const game = createGame()
    game.play('e4')
    const agreed = await recordBotGame(deps(), {
      game,
      setup: { level: botLevel(1), color: 'white' },
      termination: { reason: 'agreement' },
    })
    expect(agreed.result).toBe('1/2-1/2')
    const timedOut = await recordBotGame(
      { ...deps(), newId: () => 'game-2' },
      {
        game,
        setup: { level: botLevel(1), color: 'white' },
        termination: { reason: 'timeout', loser: 'white', draw: true },
      },
    )
    expect(timedOut.result).toBe('1/2-1/2')
    expect(importPgn(timedOut.pgn).headers.Termination).toBe(
      'Game drawn by timeout vs insufficient material',
    )
  })
})
