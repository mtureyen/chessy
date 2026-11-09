import { createGame } from '@pawnia/chess'
import { describe, expect, it } from 'vitest'
import { MATCH_OPENINGS } from '../domain/openings'
import { playBotMatch, type MatchPlayer } from './playBotMatch'

/** Plays the given moves in order, then the first legal move; reports a fixed evaluation. */
function scripted(name: string, moves: string[], whiteWinChance?: number): MatchPlayer {
  return {
    name,
    async move(fen) {
      const first = createGame(fen).legalMoves()[0]!
      const move = moves.shift() ?? `${first.from}${first.to}${first.promotion?.[0] ?? ''}`
      return { move, ...(whiteWinChance !== undefined && { whiteWinChance }) }
    },
  }
}

describe('playBotMatch', () => {
  it('plays to mate and records the game', async () => {
    const game = await playBotMatch({
      white: scripted('w', ['f2f3', 'g2g4']),
      black: scripted('b', ['e7e5', 'd8h4']),
    })
    expect(game).toMatchObject({ white: 'w', black: 'b', result: '0-1', ending: 'board', plies: 4 })
    expect(game.pgn).toContain('Qh4#')
  })

  it('starts from the opening and stops a decided game early', async () => {
    const game = await playBotMatch(
      { white: scripted('w', [], 99.9), black: scripted('b', [], 99.9) },
      ['e2e4', 'e7e5'],
    )
    expect(game).toMatchObject({ result: '1-0', ending: 'adjudicated', plies: 12 })
    expect(game.pgn).toContain('1. e4 e5')
  })

  it('rejects an illegal move', async () => {
    await expect(
      playBotMatch({ white: scripted('w', ['e2e5']), black: scripted('b', []) }),
    ).rejects.toThrow(/w played an illegal move/)
  })
})

describe('MATCH_OPENINGS', () => {
  it('are all legal and distinct', () => {
    const seen = new Set<string>()
    for (const { name, moves } of MATCH_OPENINGS) {
      const game = createGame()
      for (const move of moves) expect(game.play(move), `${name}: ${move}`).toBeTruthy()
      seen.add(game.fen())
    }
    expect(seen.size).toBe(MATCH_OPENINGS.length)
  })
})
