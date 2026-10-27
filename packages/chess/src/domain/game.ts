import { Chess, castlingSide, normalizeMove } from 'chessops/chess'
import { chessgroundDests } from 'chessops/compat'
import { INITIAL_FEN, makeFen, parseFen } from 'chessops/fen'
import { makeSanAndPlay, parseSan } from 'chessops/san'
import { isNormal, type NormalMove } from 'chessops/types'
import {
  kingCastlesTo,
  makeSquare,
  makeUci,
  opposite,
  parseSquare,
  parseUci,
  squareRank,
} from 'chessops/util'
import {
  PROMOTION_ROLES,
  type Color,
  type GameStatus,
  type Move,
  type MoveNode,
  type PlayedMove,
  type PromotionRole,
  type SquareName,
} from './types'

/**
 * A game as a tree of positions with a cursor (`current`).
 *
 * The rules core of Chessy. UI code talks only to this interface, so the chessops
 * implementation behind it can be swapped later (e.g. for Rust/WASM).
 *
 * `status()` reports how the position stands, but `play()` accepts any legal move, even
 * after a draw by repetition or the fifty-move rule. Whether a finished game may continue
 * is up to the caller (local play stops, imported OTB games often play on).
 */
export interface GameState {
  readonly root: MoveNode
  readonly current: MoveNode

  fen(): string
  turn(): Color
  isCheck(): boolean
  status(node?: MoveNode): GameStatus

  legalMoves(): Move[]
  /** Legal destinations per origin square, in the shape chessground expects. */
  dests(): Map<SquareName, SquareName[]>
  isPromotion(from: SquareName, to: SquareName): boolean

  /**
   * Plays a move (object, UCI or SAN) from the current node and moves the cursor onto it.
   * Reuses the existing child if that move was played before, otherwise adds a new
   * variation. Returns undefined if the move is illegal.
   */
  play(move: Move | string): MoveNode | undefined

  goTo(node: MoveNode): void
  back(): boolean
  forward(): boolean
  toStart(): void
  toEnd(): void
  /** Removes the current node (and everything after it) and steps back to its parent. */
  takeback(): boolean

  /** True if every step from the root to the node takes the first child. */
  isMainline(node: MoveNode): boolean
  /** Moves the node's variation up one level: it replaces the line it branched from. */
  promote(node: MoveNode): void
  /** Makes the path to the node the main line, all the way up to the root. */
  makeMainline(node: MoveNode): void
  /** Deletes the node and everything after it. A cursor inside that branch moves to the node's parent. */
  delete(node: MoveNode): boolean

  /** Moves from the start up to `current`, followed by the main continuation after it. */
  line(): MoveNode[]
}

export class InvalidPositionError extends Error {}

export function createGame(fen: string = INITIAL_FEN): GameState {
  return new ChessopsGame(positionFromFen(fen))
}

function positionFromFen(fen: string): Chess {
  const setup = parseFen(fen.trim())
  if (setup.isErr) throw new InvalidPositionError(`Invalid FEN (${setup.error.message})`)
  const pos = Chess.fromSetup(setup.value)
  if (pos.isErr) throw new InvalidPositionError(`Illegal position (${pos.error.message})`)
  return pos.value
}

interface Node extends MoveNode {
  parent: Node | undefined
  children: Node[]
  pos: Chess
  /** FEN without move clocks; equal keys count as the same position for repetitions. */
  repetitionKey: string
}

class ChessopsGame implements GameState {
  readonly root: Node
  private cur: Node
  private nextId = 0

  constructor(pos: Chess) {
    this.root = this.makeNode(pos, undefined, undefined)
    this.cur = this.root
  }

  get current(): MoveNode {
    return this.cur
  }

  fen(): string {
    return this.cur.fen
  }

  turn(): Color {
    return this.cur.pos.turn
  }

  isCheck(): boolean {
    return this.cur.pos.isCheck()
  }

  status(node: MoveNode = this.cur): GameStatus {
    const n = this.own(node)
    const pos = n.pos
    if (pos.isCheckmate()) return { kind: 'checkmate', winner: opposite(pos.turn) }
    if (pos.isStalemate()) return { kind: 'draw', reason: 'stalemate' }
    if (pos.isInsufficientMaterial()) return { kind: 'draw', reason: 'insufficient-material' }
    if (repetitions(n) >= 3) return { kind: 'draw', reason: 'threefold-repetition' }
    if (pos.halfmoves >= 100) return { kind: 'draw', reason: 'fifty-move-rule' }
    return { kind: 'ongoing' }
  }

  legalMoves(): Move[] {
    const pos = this.cur.pos
    const moves: Move[] = []
    for (const [from, dests] of pos.allDests()) {
      const isPawn = pos.board.getRole(from) === 'pawn'
      for (const to of dests) {
        if (isPawn && isBackRank(to)) {
          for (const promotion of PROMOTION_ROLES)
            moves.push(toStandardMove(pos, { from, to, promotion }))
        } else {
          moves.push(toStandardMove(pos, { from, to }))
        }
      }
    }
    return moves
  }

  dests(): Map<SquareName, SquareName[]> {
    return chessgroundDests(this.cur.pos)
  }

  isPromotion(from: SquareName, to: SquareName): boolean {
    const pos = this.cur.pos
    const orig = parseSquare(from)
    const dest = parseSquare(to)
    return (
      pos.board.getRole(orig) === 'pawn' &&
      isBackRank(dest) &&
      pos.isLegal({ from: orig, to: dest, promotion: 'queen' })
    )
  }

  play(input: Move | string): MoveNode | undefined {
    const pos = this.cur.pos
    const move = typeof input === 'string' ? parseMoveString(pos, input) : fromMove(pos, input)
    if (!move || !pos.isLegal(move)) return undefined

    const standard = toStandardMove(pos, move)
    const uci = makeUci({
      from: parseSquare(standard.from),
      to: parseSquare(standard.to),
      promotion: standard.promotion,
    })
    const existing = this.cur.children.find((child) => child.move?.uci === uci)
    if (existing) {
      this.cur = existing
      return existing
    }

    const next = pos.clone()
    const san = makeSanAndPlay(next, move)
    const played: PlayedMove = { ...standard, uci, san, color: pos.turn, moveNumber: pos.fullmoves }
    const node = this.makeNode(next, this.cur, played)
    this.cur.children.push(node)
    this.cur = node
    return node
  }

  goTo(node: MoveNode): void {
    this.cur = this.own(node)
  }

  back(): boolean {
    if (!this.cur.parent) return false
    this.cur = this.cur.parent
    return true
  }

  forward(): boolean {
    const next = this.cur.children[0]
    if (!next) return false
    this.cur = next
    return true
  }

  toStart(): void {
    this.cur = this.root
  }

  toEnd(): void {
    while (this.forward());
  }

  takeback(): boolean {
    return this.delete(this.cur)
  }

  isMainline(node: MoveNode): boolean {
    for (let n = this.own(node); n.parent; n = n.parent) {
      if (n.parent.children[0] !== n) return false
    }
    return true
  }

  promote(node: MoveNode): void {
    for (let n = this.own(node); n.parent; n = n.parent) {
      if (n.parent.children[0] !== n) {
        moveToFront(n.parent, n)
        return
      }
    }
  }

  makeMainline(node: MoveNode): void {
    for (let n = this.own(node); n.parent; n = n.parent) moveToFront(n.parent, n)
  }

  delete(node: MoveNode): boolean {
    const n = this.own(node)
    const parent = n.parent
    if (!parent) return false
    parent.children = parent.children.filter((child) => child !== n)
    for (let c: Node | undefined = this.cur; c; c = c.parent) {
      if (c === n) {
        this.cur = parent
        break
      }
    }
    return true
  }

  line(): MoveNode[] {
    const path: MoveNode[] = []
    for (let n: Node | undefined = this.cur; n?.parent; n = n.parent) path.unshift(n)
    for (let n = this.cur.children[0]; n; n = n.children[0]) path.push(n)
    return path
  }

  private makeNode(pos: Chess, parent: Node | undefined, move: PlayedMove | undefined): Node {
    const setup = pos.toSetup()
    return {
      id: `n${this.nextId++}`,
      parent,
      children: [],
      ply: parent ? parent.ply + 1 : 0,
      fen: makeFen(setup),
      move,
      pos,
      repetitionKey: makeFen(setup, { epd: true }),
    }
  }

  private own(node: MoveNode): Node {
    let n = node
    while (n.parent) n = n.parent
    if (n !== this.root) throw new Error('Node does not belong to this game')
    return node as Node
  }
}

function moveToFront(parent: Node, child: Node): void {
  parent.children = [child, ...parent.children.filter((c) => c !== child)]
}

/** How often the node's position occurred on the path leading to it (itself included). */
function repetitions(node: Node): number {
  let count = 0
  for (let n: Node | undefined = node; n; n = n.parent) {
    if (n.repetitionKey === node.repetitionKey) count++
    // Captures and pawn moves reset the clock; nothing before them can repeat.
    if (n.pos.halfmoves === 0) break
  }
  return count
}

function isBackRank(square: number): boolean {
  const rank = squareRank(square)
  return rank === 0 || rank === 7
}

function parseMoveString(pos: Chess, str: string): NormalMove | undefined {
  const uci = parseUci(str.trim())
  const move = uci ? normalizeMove(pos, uci) : parseSan(pos, str.trim())
  return move && isNormal(move) ? move : undefined
}

function fromMove(pos: Chess, move: Move): NormalMove {
  return normalizeMove(pos, {
    from: parseSquare(move.from),
    to: parseSquare(move.to),
    promotion: move.promotion,
  }) as NormalMove
}

/** chessops encodes castling as king-takes-rook; outward we use the king's destination. */
function toStandardMove(pos: Chess, move: NormalMove): Move {
  const side = castlingSide(pos, move)
  const to = side ? kingCastlesTo(pos.turn, side) : move.to
  const standard: Move = { from: makeSquare(move.from), to: makeSquare(to) }
  if (move.promotion) standard.promotion = move.promotion as PromotionRole
  return standard
}
