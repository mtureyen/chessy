import { describe, expect, it } from 'vitest'
import { loadAddress, saveAddress, type SyncStorage } from './address'
import { DEFAULT_PAWNIA_URL } from './link'

function memoryStorage(): SyncStorage {
  const map = new Map<string, unknown>()
  return {
    get: async (defaults) =>
      Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, map.get(k) ?? v])),
    set: async (items) => void Object.entries(items).forEach(([k, v]) => map.set(k, v)),
  }
}

describe('loadAddress', () => {
  it('starts with the default address', async () => {
    expect(await loadAddress(memoryStorage())).toBe(DEFAULT_PAWNIA_URL)
  })

  it('reads back what was saved', async () => {
    const storage = memoryStorage()
    await saveAddress(storage, 'http://localhost:4000')
    expect(await loadAddress(storage)).toBe('http://localhost:4000')
  })
})
