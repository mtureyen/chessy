import { DEFAULT_PAWNIA_URL } from './link'

/** The part of chrome.storage.sync the address needs. */
export interface SyncStorage {
  get(keys: Record<string, unknown>): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string): Promise<void>
}

/** Where the options keep the pawnia address. */
export const ADDRESS_KEY = 'pawniaUrl'
/** Where they kept it under the app's old name. */
const OLD_ADDRESS_KEY = 'chessyUrl'

/** The pawnia address from the options, moved from the old name's key on the way. */
export async function loadAddress(storage: SyncStorage): Promise<string> {
  const items = await storage.get({ [ADDRESS_KEY]: null, [OLD_ADDRESS_KEY]: null })
  const old = items[OLD_ADDRESS_KEY]
  if (old != null) {
    if (items[ADDRESS_KEY] == null) await storage.set({ [ADDRESS_KEY]: old })
    await storage.remove(OLD_ADDRESS_KEY)
  }
  const saved = items[ADDRESS_KEY] ?? old
  return typeof saved === 'string' ? saved : DEFAULT_PAWNIA_URL
}

export function saveAddress(storage: SyncStorage, url: string): Promise<void> {
  return storage.set({ [ADDRESS_KEY]: url })
}
