import { createGame, importPgn, type MoveNode } from '@chessy/chess'
import { describe, expect, it } from 'vitest'
import {
  moveTreeItems,
  variationTokens,
  type MoveTreeItem,
  type VariationToken,
} from './moveTreeLayout'

const san = (node: MoveNode | undefined) => node?.move?.san

function text(tokens: VariationToken[]): string {
  return tokens
    .map((t) =>
      t.kind === 'open'
        ? '('
        : t.kind === 'close'
          ? ')'
          : `${t.number ? `${t.number} ` : ''}${san(t.node)}`,
    )
    .join(' ')
    .replaceAll('( ', '(')
    .replaceAll(' )', ')')
}

function describe_(items: MoveTreeItem[]): string[] {
  return items.map((item) =>
    item.kind === 'row'
      ? `${item.number}. ${san(item.white) ?? '…'} ${san(item.black) ?? (item.interrupted ? '…' : '')}`.trim()
      : `[${item.lines.map(text).join(' | ')}]`,
  )
}

describe('moveTreeItems', () => {
  it('lays out a plain main line in rows of two', () => {
    const { game } = importPgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 *')
    expect(describe_(moveTreeItems(game.root))).toEqual(['1. e4 e5', '2. Nf3 Nc6', '3. Bb5'])
  })

  it('breaks the row for alternatives to a White move', () => {
    const { game } = importPgn('1. e4 (1. d4 d5) (1. c4) 1... e5 2. Nf3 *')
    expect(describe_(moveTreeItems(game.root))).toEqual([
      '1. e4 …',
      '[1. d4 d5 | 1. c4]',
      '1. … e5',
      '2. Nf3',
    ])
  })

  it('puts alternatives to a Black move after the full row', () => {
    const { game } = importPgn('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *')
    expect(describe_(moveTreeItems(game.root))).toEqual(['1. e4 e5', '[1... c5 2. Nf3]', '2. Nf3'])
  })

  it('starts with Black when the position does', () => {
    const game = createGame('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')
    game.play('c5')
    game.play('Nf3')
    expect(describe_(moveTreeItems(game.root))).toEqual(['1. … c5', '2. Nf3'])
  })
})

describe('variationTokens', () => {
  it('nests alternatives and renumbers after them', () => {
    const { game } = importPgn('1. e4 (1. d4 d5 (1... Nf6 2. c4) 2. c4 e6) e5 *')
    const d4 = game.root.children[1]!
    expect(text(variationTokens(d4))).toBe('1. d4 d5 (1... Nf6 2. c4) 2. c4 e6')
  })
})
