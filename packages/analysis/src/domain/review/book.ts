import { createGame, importPgn } from '@chessy/chess'
import { positionKey } from './keys'

export interface Opening {
  eco: string
  name: string
}

/** Port: known opening theory. */
export interface OpeningBook {
  /** The position occurs in a known opening line. */
  isBook(fen: string): boolean
  /** The named opening this exact position is, if any. */
  opening(fen: string): Opening | undefined
}

/**
 * Serialized book: compact position hash → [eco, name] for named positions, 0 for positions
 * that are only on the way to one.
 */
export interface BookData {
  version: 1
  positions: Record<string, [string, string] | 0>
}

/** 53-bit string hash (cyrb53), base 36. Keeps the book file small; collisions are negligible. */
export function bookKey(fen: string): string {
  const text = positionKey(fen)
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** Builds the book from opening lines (lichess chess-openings TSV rows: eco, name, pgn). */
export function buildBookData(
  lines: readonly { eco: string; name: string; pgn: string }[],
): BookData {
  const positions: BookData['positions'] = {}
  for (const line of lines) {
    const { game } = importPgn(line.pgn)
    const nodes = game.line()
    nodes.forEach((node, i) => {
      const key = bookKey(node.fen)
      if (i === nodes.length - 1) positions[key] = [line.eco, line.name]
      else positions[key] ??= 0
    })
  }
  positions[bookKey(createGame().fen())] ??= 0
  return { version: 1, positions }
}

export function createOpeningBook(data: BookData): OpeningBook {
  return {
    isBook: (fen) => bookKey(fen) in data.positions,
    opening: (fen) => {
      const entry = data.positions[bookKey(fen)]
      return entry ? { eco: entry[0], name: entry[1] } : undefined
    },
  }
}
