import { describe, expect, it } from 'vitest'
import { formatTimeControl } from './format'

describe('formatTimeControl', () => {
  it.each([
    ['180+2', '3+2'],
    ['180', '3+0'],
    ['60+0', '1+0'],
    ['15+0', '¼+0'],
    ['30+0', '½+0'],
    ['90+30', '1.5+30'],
    ['5400+30', '90+30'],
  ])('%s → %s', (input, output) => {
    expect(formatTimeControl(input)).toBe(output)
  })

  it('passes unknown formats through and handles missing values', () => {
    expect(formatTimeControl('1/86400')).toBe('1/86400')
    expect(formatTimeControl(undefined)).toBeUndefined()
  })
})
