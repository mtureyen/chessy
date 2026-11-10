import { describe, expect, it } from 'vitest'
import {
  lastMove,
  lineText,
  recordText,
  repertoireTree,
  scoreText,
  strengthLabel,
  type RepertoireLine,
} from './format'

const tally = { games: 21, wins: 12, draws: 3, losses: 6, unfinished: 0, score: 64 }
const line = (moves: string): RepertoireLine => ({ moves: moves.split(' '), tally })

describe('stats format', () => {
  it('writes moves with their numbers', () => {
    expect(lastMove(['e4'])).toBe('1.e4')
    expect(lastMove(['e4', 'c5'])).toBe('1…c5')
    expect(lastMove(['e4', 'c5', 'Nf3'])).toBe('2.Nf3')
    expect(lineText(['e4', 'c5', 'Nf3'])).toBe('1.e4 c5 2.Nf3')
  })

  it('writes results', () => {
    expect(recordText(tally)).toBe('12-3-6')
    expect(scoreText(tally)).toBe('64%')
    expect(scoreText({ ...tally, score: undefined })).toBe('–')
    expect(strengthLabel('weaker (-100 or more)')).toBe('Weaker (−100 or more)')
  })

  it('rebuilds the repertoire tree from its depth-first lines', () => {
    const tree = repertoireTree([
      line('e4'),
      line('e4 c5'),
      line('e4 c5 Nf3'),
      line('e4 e5'),
      line('d4'),
    ])
    expect(tree.map((n) => n.line.moves.join(' '))).toEqual(['e4', 'd4'])
    expect(tree[0]!.children.map((n) => n.line.moves.join(' '))).toEqual(['e4 c5', 'e4 e5'])
    expect(tree[0]!.children[0]!.children).toHaveLength(1)
    expect(tree[1]!.children).toEqual([])
  })
})
