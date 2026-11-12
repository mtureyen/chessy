import { attacks, between, ray } from 'chessops/attacks'
import { Chess, normalizeMove } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import { SquareSet } from 'chessops/squareSet'
import { isNormal, type Role, type Square } from 'chessops/types'
import { makeSquare, opposite, parseSquare, parseUci, squareFile, squareRank } from 'chessops/util'
import { legalMovesOf } from './game'
import type { Color, Move, SquareName } from './types'

export type { Role }

export interface Piece {
  role: Role
  color: Color
}

/**
 * One position, for questions about what stands where and what attacks what: the level below
 * `GameState`, for code that reasons about tactics. A view never changes; `play` returns the
 * position after a move.
 *
 * "Attacks" are geometric throughout: a pinned piece still attacks, and a piece attacks the
 * squares of its own side's pieces too (it defends them).
 */
export interface BoardView {
  readonly fen: string
  readonly turn: Color
  pieceAt(square: SquareName): Piece | undefined
  pieces(): { square: SquareName; piece: Piece }[]
  kingOf(color: Color): SquareName | undefined
  /** The squares the piece on `square` attacks; none if the square is empty. */
  attacksFrom(square: SquareName): SquareName[]
  /**
   * The squares of `by`'s pieces that attack `square`, from a1 upwards. `without`: as if that
   * square were empty, which shows what stands behind a piece on the same line.
   */
  attackers(square: SquareName, by: Color, without?: SquareName): SquareName[]
  /**
   * The line a piece is pinned to: it stands alone between its own king and an enemy rook, bishop
   * or queen. All squares of that line across the board; undefined if the piece isn't pinned.
   */
  pinLine(square: SquareName): SquareName[] | undefined
  /** The pieces giving check to the side to move. */
  checkers(): SquareName[]
  isCheck(): boolean
  isCheckmate(): boolean
  legalMoves(): Move[]
  /**
   * Where the piece on `square` could go if its king's safety didn't matter (castling aside).
   * En passant only counts for the side to move.
   */
  pseudoLegalDests(square: SquareName): SquareName[]
  /** The position after a move in UCI (castling as the king's move, e.g. e1g1); undefined if illegal. */
  play(uci: string): BoardView | undefined
}

/** Throws on a FEN that doesn't describe a legal position. */
export function boardView(fen: string): BoardView {
  const setup = parseFen(fen.trim())
  if (setup.isErr) throw new Error(`Invalid FEN: ${fen}`)
  const pos = Chess.fromSetup(setup.value)
  if (pos.isErr) throw new Error(`Illegal position: ${fen}`)
  return new ChessopsBoard(pos.value)
}

/** The file (0 = a) and rank (0 = first) of a square. */
export function squareCoords(square: SquareName): { file: number; rank: number } {
  const index = parseSquare(square)
  return { file: squareFile(index), rank: squareRank(index) }
}

/** The square at a file and rank (both 0-based); undefined off the board. */
export function squareAt(file: number, rank: number): SquareName | undefined {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return undefined
  return makeSquare(file + 8 * rank)
}

/** King moves between two squares. */
export function squareDistance(a: SquareName, b: SquareName): number {
  const from = squareCoords(a)
  const to = squareCoords(b)
  return Math.max(Math.abs(from.file - to.file), Math.abs(from.rank - to.rank))
}

/** The squares strictly between two squares on a shared rank, file or diagonal; none otherwise. */
export function squaresBetween(a: SquareName, b: SquareName): SquareName[] {
  return names(between(parseSquare(a), parseSquare(b)))
}

class ChessopsBoard implements BoardView {
  private readonly pos: Chess
  private fenText: string | undefined

  constructor(pos: Chess) {
    this.pos = pos
  }

  get fen(): string {
    this.fenText ??= makeFen(this.pos.toSetup())
    return this.fenText
  }

  get turn(): Color {
    return this.pos.turn
  }

  pieceAt(square: SquareName): Piece | undefined {
    const piece = this.pos.board.get(parseSquare(square))
    return piece && { role: piece.role, color: piece.color }
  }

  pieces(): { square: SquareName; piece: Piece }[] {
    return [...this.pos.board].map(([square, piece]) => ({
      square: makeSquare(square),
      piece: { role: piece.role, color: piece.color },
    }))
  }

  kingOf(color: Color): SquareName | undefined {
    const king = this.pos.board.kingOf(color)
    return king === undefined ? undefined : makeSquare(king)
  }

  attacksFrom(square: SquareName): SquareName[] {
    const from = parseSquare(square)
    const piece = this.pos.board.get(from)
    return piece ? names(attacks(piece, from, this.pos.board.occupied)) : []
  }

  attackers(square: SquareName, by: Color, without?: SquareName): SquareName[] {
    const board = this.pos.board
    const occupied = without ? board.occupied.without(parseSquare(without)) : board.occupied
    let found = this.pos.kingAttackers(parseSquare(square), by, occupied)
    if (without) found = found.without(parseSquare(without))
    return names(found)
  }

  pinLine(square: SquareName): SquareName[] | undefined {
    const line = this.pinRay(parseSquare(square))
    return line && names(line)
  }

  checkers(): SquareName[] {
    return names(this.pos.ctx().checkers)
  }

  isCheck(): boolean {
    return this.pos.isCheck()
  }

  isCheckmate(): boolean {
    return this.pos.isCheckmate()
  }

  legalMoves(): Move[] {
    return legalMovesOf(this.pos)
  }

  pseudoLegalDests(square: SquareName): SquareName[] {
    const from = parseSquare(square)
    const board = this.pos.board
    const piece = board.get(from)
    if (!piece) return []
    const own = board[piece.color]
    if (piece.role !== 'pawn') return names(attacks(piece, from, board.occupied).diff(own))

    let takeable = board[opposite(piece.color)]
    if (this.pos.epSquare !== undefined && this.pos.turn === piece.color) {
      takeable = takeable.with(this.pos.epSquare)
    }
    let dests = attacks(piece, from, board.occupied).intersect(takeable)
    const step = piece.color === 'white' ? 8 : -8
    const homeRank = piece.color === 'white' ? 1 : 6
    const one = from + step
    if (one >= 0 && one < 64 && !board.occupied.has(one)) {
      dests = dests.with(one)
      const two = one + step
      if (squareRank(from) === homeRank && !board.occupied.has(two)) dests = dests.with(two)
    }
    return names(dests)
  }

  play(uci: string): BoardView | undefined {
    const parsed = parseUci(uci)
    if (!parsed || !isNormal(parsed)) return undefined
    const move = normalizeMove(this.pos, parsed)
    if (!this.pos.isLegal(move)) return undefined
    const next = this.pos.clone()
    next.play(move)
    return new ChessopsBoard(next)
  }

  /** The line through the piece's own king and the enemy slider that pins it, if one does. */
  private pinRay(square: Square): SquareSet | undefined {
    const board = this.pos.board
    const piece = board.get(square)
    if (!piece) return undefined
    const king = board.kingOf(piece.color)
    if (king === undefined || king === square) return undefined
    const empty = SquareSet.empty()
    const snipers = attacks({ role: 'rook', color: piece.color }, king, empty)
      .intersect(board.rooksAndQueens())
      .union(
        attacks({ role: 'bishop', color: piece.color }, king, empty).intersect(
          board.bishopsAndQueens(),
        ),
      )
      .intersect(board[opposite(piece.color)])
    for (const sniper of snipers) {
      const blockers = between(king, sniper).intersect(board.occupied)
      if (blockers.singleSquare() === square) return ray(king, sniper)
    }
    return undefined
  }
}

function names(squares: SquareSet): SquareName[] {
  return [...squares].map(makeSquare)
}
