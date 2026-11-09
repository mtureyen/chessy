import { describe, expect, it } from 'vitest'
import { moveRenamedKeys } from './renamedKeys'

/** A Storage over a Map, enough for the move. */
function memoryStorage(entries: Record<string, string>): Storage {
  const map = new Map(Object.entries(entries))
  return {
    get length() {
      return map.size
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    clear: () => map.clear(),
  }
}

const contents = (storage: Storage) =>
  Object.fromEntries(
    Array.from({ length: storage.length }, (_, i) => storage.key(i)!).map((k) => [
      k,
      storage.getItem(k),
    ]),
  )

describe('moveRenamedKeys', () => {
  it('moves keys from the old name to the new one and leaves others alone', () => {
    const storage = memoryStorage({
      'chessy.board-appearance': '{"board":"green"}',
      'chessy.history-import.chesscom:8sly': '2026-11-01',
      'other.key': 'x',
    })
    moveRenamedKeys(storage)
    expect(contents(storage)).toEqual({
      'other.key': 'x',
      'pawnia.board-appearance': '{"board":"green"}',
      'pawnia.history-import.chesscom:8sly': '2026-11-01',
    })
  })

  it('keeps a value already set under the new name', () => {
    const storage = memoryStorage({
      'chessy.welcome-dismissed': '0',
      'pawnia.welcome-dismissed': '1',
    })
    moveRenamedKeys(storage)
    expect(contents(storage)).toEqual({ 'pawnia.welcome-dismissed': '1' })
  })
})
