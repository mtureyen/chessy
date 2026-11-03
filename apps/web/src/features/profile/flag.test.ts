import { describe, expect, it } from 'vitest'
import { flagEmoji } from './flag'

describe('flagEmoji', () => {
  it('turns a country code into its flag', () => {
    expect(flagEmoji('DE')).toBe('🇩🇪')
    expect(flagEmoji('US')).toBe('🇺🇸')
  })

  it('ignores anything else', () => {
    expect(flagEmoji(undefined)).toBeUndefined()
    expect(flagEmoji('_earth')).toBeUndefined()
  })
})
