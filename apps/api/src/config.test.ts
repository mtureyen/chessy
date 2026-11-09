import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

describe('loadConfig', () => {
  it('still reads a renamed variable under its old name', () => {
    expect(loadConfig({ CHESSY_SOURCES: 'recorded' }).PAWNIA_SOURCES).toBe('recorded')
  })

  it('prefers the new name when both are set', () => {
    const config = loadConfig({ CHESSY_SOURCES: 'recorded', PAWNIA_SOURCES: 'live' })
    expect(config.PAWNIA_SOURCES).toBe('live')
  })
})
