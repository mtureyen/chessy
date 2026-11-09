const OLD_PREFIX = 'chessy.'
const PREFIX = 'pawnia.'

/**
 * Moves what this browser keeps in localStorage under the app's old name to the new one. A key
 * already set under the new name wins. Runs before anything reads a key.
 */
export function moveRenamedKeys(storage: Storage | undefined = globalThis.localStorage): void {
  if (!storage) return
  try {
    const old = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(
      (key): key is string => key?.startsWith(OLD_PREFIX) ?? false,
    )
    for (const key of old) {
      const renamed = PREFIX + key.slice(OLD_PREFIX.length)
      const value = storage.getItem(key)
      if (storage.getItem(renamed) === null && value !== null) storage.setItem(renamed, value)
      storage.removeItem(key)
    }
  } catch {
    // Storage blocked or full: the app runs with defaults, and tries again next start.
  }
}
