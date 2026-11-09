import { DEFAULT_PAWNIA_URL } from './link'

/** The part of chrome.storage.sync the address needs. */
export interface SyncStorage {
  get(keys: Record<string, unknown>): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

/** Where the options keep the pawnia address. */
export const ADDRESS_KEY = 'pawniaUrl'

/** The pawnia address from the options, or the default one. */
export async function loadAddress(storage: SyncStorage): Promise<string> {
  const saved = (await storage.get({ [ADDRESS_KEY]: null }))[ADDRESS_KEY]
  return typeof saved === 'string' ? saved : DEFAULT_PAWNIA_URL
}

export function saveAddress(storage: SyncStorage, url: string): Promise<void> {
  return storage.set({ [ADDRESS_KEY]: url })
}
