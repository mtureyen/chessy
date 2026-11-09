import { createHash } from 'node:crypto'
import { lineText, type GameLine } from '@pawnia/history'

/** The key a game and its review share: a hash of the main line (lines can be long). */
export function lineHash(line: GameLine): string {
  return createHash('sha256').update(lineText(line)).digest('hex')
}
