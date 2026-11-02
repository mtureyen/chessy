import { describe, expect, it } from 'vitest'
import { ADJUDICATION, adjudicate } from './adjudication'

const repeat = (value: number, times: number) => Array.from({ length: times }, () => value)

describe('adjudicate', () => {
  it('calls a win once one side stayed decisive long enough', () => {
    expect(adjudicate(repeat(99.5, 9), 40)).toBeUndefined()
    expect(adjudicate(repeat(99.5, 10), 40)).toEqual({ winner: 'white' })
    expect(adjudicate([...repeat(0.2, 9), 50], 40)).toBeUndefined()
    expect(adjudicate(repeat(0.2, 12), 40)).toEqual({ winner: 'black' })
  })

  it('calls a draw at the move limit', () => {
    expect(adjudicate(repeat(50, 20), ADJUDICATION.maxPlies)).toEqual({ draw: true })
    expect(adjudicate(repeat(50, 20), ADJUDICATION.maxPlies - 1)).toBeUndefined()
  })
})
