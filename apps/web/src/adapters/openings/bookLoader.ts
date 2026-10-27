import { createOpeningBook, type BookData, type OpeningBook } from '@chessy/analysis'

/** Built by scripts/build-openings.ts from lichess' chess-openings data (CC0). */
export const BOOK_URL = '/openings/book.json'

/** Loads the opening book once (~100 kB gzipped), the first time a review needs it. */
export function createBookLoader(url: string = BOOK_URL): () => Promise<OpeningBook> {
  let book: Promise<OpeningBook> | undefined
  return () =>
    (book ??= fetch(url).then(async (res) => {
      if (!res.ok) throw new Error(`Opening book not available (HTTP ${res.status})`)
      return createOpeningBook((await res.json()) as BookData)
    }))
}
