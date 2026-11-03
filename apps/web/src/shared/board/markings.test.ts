import type { DrawShape } from 'chessground/draw'
import type { Key } from 'chessground/types'
import { describe, expect, it } from 'vitest'
import { markClasses, takeSquareMarks, type MarkBrush } from './markings'

const circle = (orig: Key, brush = 'green'): DrawShape => ({ orig, brush })
const arrow: DrawShape = { orig: 'e2', dest: 'e4', brush: 'green' }

describe('takeSquareMarks', () => {
  it('turns circles into marked squares and leaves the arrows to chessground', () => {
    const taken = takeSquareMarks([arrow, circle('e4'), circle('d5', 'red')], new Map())!
    expect([...taken.marks]).toEqual([
      ['e4', 'green'],
      ['d5', 'red'],
    ])
    expect(taken.arrows).toEqual([arrow])
  })

  it('clears a square marked again in the same colour and recolours it in another', () => {
    const marks = new Map<Key, MarkBrush>([
      ['e4', 'green'],
      ['d5', 'green'],
    ])
    const taken = takeSquareMarks([circle('e4'), circle('d5', 'blue')], marks)!
    expect([...taken.marks]).toEqual([['d5', 'blue']])
  })

  it('does nothing when only arrows changed', () => {
    expect(takeSquareMarks([arrow], new Map())).toBeUndefined()
  })
})

describe('markClasses', () => {
  it('names the colour of each marked square', () => {
    const marks = new Map<Key, MarkBrush>([
      ['e4', 'green'],
      ['d5', 'red'],
    ])
    expect([...markClasses(marks)]).toEqual([
      ['e4', 'mark-default'],
      ['d5', 'mark-green'],
    ])
  })
})
