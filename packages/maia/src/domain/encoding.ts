/**
 * Maia-3's input and move vocabulary, as the official Maia platform feeds its browser model
 * (CSSLab/maia-platform-frontend, src/lib/engine/tensor.ts). The model always sees the position
 * from the side to move as White: with Black to move, the board is flipped top to bottom and
 * the colours are swapped, and the moves are flipped the same way.
 */
import { createGame, type Color, type Move } from '@pawnia/chess'

/** Moves the model can name: every from-to pair (64 × 64) and every promotion from rank 7 (256). */
export const MOVE_COUNT = 64 * 64 + 8 * 8 * 4

const PROMOTIONS = ['q', 'r', 'b', 'n'] as const
/** White pieces then black ones, as in the model's 12 channels per square. */
const PIECES = 'PNBRQKpnbrqk'

export interface EncodedPosition {
  /** 64 squares (a1 = 0, b1 = 1 … h8 = 63) × 12 piece channels, from the mover's side as White. */
  tokens: Float32Array
  /** Indices of the legal moves in the model's vocabulary, from the mover's side as White. */
  legal: number[]
  /** The legal moves in real UCI, in the same order as `legal`. */
  moves: string[]
  turn: Color
}

/** The square's index, a1 = 0 … h8 = 63. */
function square(name: string): number {
  return name.charCodeAt(0) - 97 + (Number(name[1]) - 1) * 8
}

/** Flips a square top to bottom (e2 ↔ e7). */
export function mirrorSquare(name: string): string {
  return `${name[0]}${9 - Number(name[1])}`
}

/** Flips a UCI move top to bottom, keeping a promotion piece. */
export function mirrorMove(uci: string): string {
  return mirrorSquare(uci.slice(0, 2)) + mirrorSquare(uci.slice(2, 4)) + uci.slice(4)
}

/** The model's index for a move given from White's side; undefined if it cannot name it. */
export function moveIndex(uci: string): number | undefined {
  const from = square(uci.slice(0, 2))
  const to = square(uci.slice(2, 4))
  const promotion = uci[4]
  if (promotion === undefined) return from * 64 + to
  const kind = PROMOTIONS.indexOf(promotion as (typeof PROMOTIONS)[number])
  if (kind < 0 || uci[1] !== '7' || uci[3] !== '8') return undefined
  return 4096 + ((from % 8) * 8 + (to % 8)) * 4 + kind
}

/** The move (from White's side) behind a vocabulary index. */
export function moveAt(index: number): string {
  const name = (sq: number) => `${String.fromCharCode(97 + (sq % 8))}${Math.floor(sq / 8) + 1}`
  if (index < 4096) return name(Math.floor(index / 64)) + name(index % 64)
  const rest = index - 4096
  const pair = Math.floor(rest / 4)
  return `${name(48 + Math.floor(pair / 8))}${name(56 + (pair % 8))}${PROMOTIONS[rest % 4]}`
}

/** Encodes a position for the model. Throws InvalidPositionError for an invalid FEN. */
export function encodePosition(fen: string): EncodedPosition {
  const game = createGame(fen)
  const turn = game.turn()
  const flip = turn === 'black'
  const tokens = new Float32Array(64 * 12)
  const rows = fen.split(' ')[0]!.split('/')
  for (const [r, row] of rows.entries()) {
    let file = 0
    for (const char of row) {
      const empty = Number(char)
      if (empty) {
        file += empty
        continue
      }
      let piece = PIECES.indexOf(char)
      const rank = 7 - r
      if (flip) piece = (piece + 6) % 12
      tokens[((flip ? 7 - rank : rank) * 8 + file) * 12 + piece] = 1
      file++
    }
  }

  const legal: number[] = []
  const moves: string[] = []
  for (const move of game.legalMoves()) {
    const uci = toUci(move)
    const index = moveIndex(flip ? mirrorMove(uci) : uci)
    if (index === undefined) continue
    legal.push(index)
    moves.push(uci)
  }
  return { tokens, legal, moves, turn }
}

function toUci({ from, to, promotion }: Move): string {
  return `${from}${to}${promotion ? (promotion === 'knight' ? 'n' : promotion[0]) : ''}`
}
