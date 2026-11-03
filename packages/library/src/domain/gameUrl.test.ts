import { describe, expect, it } from 'vitest'
import { parseGameUrl } from './gameUrl'

describe('parseGameUrl', () => {
  it.each([
    ['https://lichess.org/HqjDTU4A', { source: 'lichess', id: 'HqjDTU4A' }],
    ['https://lichess.org/HqjDTU4Aab12', { source: 'lichess', id: 'HqjDTU4A' }],
    ['https://lichess.org/HqjDTU4A/black#32', { source: 'lichess', id: 'HqjDTU4A' }],
    ['https://de.lichess.org/HqjDTU4A/', { source: 'lichess', id: 'HqjDTU4A' }],
    ['https://www.chess.com/game/live/186381504066', { source: 'chesscom', id: '186381504066' }],
    ['https://www.chess.com/game/daily/812345678?move=12', { source: 'chesscom', id: '812345678' }],
    ['https://www.chess.com/game/186381504066', { source: 'chesscom', id: '186381504066' }],
    [
      'https://www.chess.com/analysis/game/live/186381504066/review',
      { source: 'chesscom', id: '186381504066' },
    ],
    [
      'https://www.chessigma.com/import/chesscom/game/live/186381504066?utm_source=x',
      { source: 'chesscom', id: '186381504066' },
    ],
    ['https://www.chessigma.com/import/lichess/HqjDTU4A', { source: 'lichess', id: 'HqjDTU4A' }],
  ])('%s', (url, expected) => {
    expect(parseGameUrl(url)).toEqual(expected)
  })

  it.each([
    'https://lichess.org/analysis',
    'https://lichess.org/training',
    'https://lichess.org/@/DrNykterstein',
    'https://lichess.org/study/abcdefgh',
    'https://www.chess.com/member/8sly',
    'https://www.chessigma.com/games/450230',
    'https://example.com/game/live/1',
    'not a url',
  ])('ignores %s', (url) => {
    expect(parseGameUrl(url)).toBeUndefined()
  })
})
