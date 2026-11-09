import { describe, expect, it } from 'vitest'
import { loadAddress, saveAddress, type SyncStorage } from './address'
import { DEFAULT_PAWNIA_URL } from './link'

function memoryStorage(entries: Record<string, unknown> = {}) {
  const map = new Map(Object.entries(entries))
  const storage: SyncStorage = {
    get: async (defaults) =>
      Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, map.get(k) ?? v])),
    set: async (items) => void Object.entries(items).forEach(([k, v]) => map.set(k, v)),
    remove: async (key) => void map.delete(key),
  }
  return { storage, map }
}

describe('loadAddress', () => {
  it('starts with the default address', async () => {
    expect(await loadAddress(memoryStorage().storage)).toBe(DEFAULT_PAWNIA_URL)
  })

  it('moves an address saved under the old name', async () => {
    const { storage, map } = memoryStorage({ chessyUrl: 'https://pawnia.example' })
    expect(await loadAddress(storage)).toBe('https://pawnia.example')
    expect(Object.fromEntries(map)).toEqual({ pawniaUrl: 'https://pawnia.example' })
  })

  it('keeps an address saved under the new name', async () => {
    const { storage, map } = memoryStorage({
      chessyUrl: 'http://old.example',
      pawniaUrl: 'http://new.example',
    })
    expect(await loadAddress(storage)).toBe('http://new.example')
    expect(Object.fromEntries(map)).toEqual({ pawniaUrl: 'http://new.example' })
  })

  it('reads back what was saved', async () => {
    const { storage } = memoryStorage()
    await saveAddress(storage, 'http://localhost:4000')
    expect(await loadAddress(storage)).toBe('http://localhost:4000')
  })
})
