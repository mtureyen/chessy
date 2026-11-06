import { readFile } from 'node:fs/promises'
import { createOpeningBook, type BookData, type OpeningBook } from '@chessy/analysis'

/**
 * Loads the opening book (the web app's file) once, the first time it is needed. Without the file
 * there is none, and what uses it does without.
 */
export function createBookLoader(path: string): () => Promise<OpeningBook | undefined> {
  let book: Promise<OpeningBook | undefined> | undefined
  return () =>
    (book ??= readFile(path, 'utf8')
      .then((text) => createOpeningBook(JSON.parse(text) as BookData))
      .catch(() => undefined))
}
