import { boardView, type BoardView, type Color, type Role, type SquareName } from '@pawnia/chess'

/**
 * A tactic as lichess stores its puzzles: a position and the moves played from it. The first
 * move is the opponent's (it sets the tactic up, often as the mistake that allows it), then the
 * solver's and the opponent's moves take turns, and the solver's move comes last.
 */
export interface TacticLine {
  /** The position before the opponent's move. */
  fen: string
  /** UCI moves, castling as the king's move (e1g1). */
  moves: readonly string[]
}

/** One move of the line with the positions around it. */
export interface LineNode {
  from: SquareName
  to: SquareName
  promotion: Role | undefined
  /** The position the move was played in, and the one it led to. */
  before: BoardView
  after: BoardView
  /** What stands on the move's target square afterwards: for a promotion the new piece. */
  moved: Role
  /** The piece that stood on the target square; undefined for en passant. */
  captured: Role | undefined
  isCapture: boolean
}

/** A line replayed: `mainline[0]` is the opponent's first move, odd indexes are the solver's. */
export interface TacticPuzzle {
  start: BoardView
  mainline: LineNode[]
  /** The solving side. */
  pov: Color
}

const PROMOTIONS: Record<string, Role> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }

/** Every move of a line with its positions; undefined if the position or a move is not legal. */
export function replayMoves(line: TacticLine): { start: BoardView; nodes: LineNode[] } | undefined {
  let board: BoardView
  try {
    board = boardView(line.fen)
  } catch {
    return undefined
  }
  const start = board
  const nodes: LineNode[] = []
  for (const uci of line.moves) {
    const after = board.play(uci)
    if (!after) return undefined
    const from = uci.slice(0, 2) as SquareName
    const to = uci.slice(2, 4) as SquareName
    const mover = board.pieceAt(from)
    const captured = board.pieceAt(to)
    const landed = after.pieceAt(to)
    if (!mover || !landed) return undefined
    nodes.push({
      from,
      to,
      promotion: PROMOTIONS[uci[4] ?? ''],
      before: board,
      after,
      moved: landed.role,
      captured: captured?.role,
      // A pawn that changes file onto an empty square took en passant.
      isCapture: captured !== undefined || (mover.role === 'pawn' && from[0] !== to[0]),
    })
    board = after
  }
  return { start, nodes }
}

/**
 * Replays a line as a puzzle. A move the opponent makes after the solver's last one is dropped;
 * undefined if the line can't be played or the solver doesn't get to move at all.
 */
export function replayLine(line: TacticLine): TacticPuzzle | undefined {
  const replayed = replayMoves(line)
  if (!replayed) return undefined
  const { start, nodes: mainline } = replayed
  if (mainline.length % 2 === 1) mainline.pop()
  if (mainline.length < 2) return undefined
  return { start, mainline, pov: start.turn === 'white' ? 'black' : 'white' }
}

/** The solver's moves, in order. */
export function solverNodes(puzzle: TacticPuzzle): LineNode[] {
  return puzzle.mainline.filter((_, index) => index % 2 === 1)
}
