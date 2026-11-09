import { parseGameUrl } from '@pawnia/library'

export const DEFAULT_CHESSY_URL = 'http://localhost:5173'

/** pawnia's page that opens the game shown at `pageUrl`, or undefined if it shows no game. */
export function chessyLink(chessyUrl: string, pageUrl: string): string | undefined {
  if (!parseGameUrl(pageUrl)) return undefined
  const base = chessyUrl.trim().replace(/\/+$/, '') || DEFAULT_CHESSY_URL
  return `${base}/open?${new URLSearchParams({ url: pageUrl })}`
}

/** A usable pawnia address (http or https), or undefined. */
export function normalizeChessyUrl(input: string): string | undefined {
  try {
    const url = new URL(input.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return url.origin + url.pathname.replace(/\/+$/, '')
  } catch {
    return undefined
  }
}
