/**
 * The detectors behind lichess' puzzle themes, ported from `tagger/cook.py` and `tagger/util.py`
 * of lichess-puzzler (https://github.com/ornicar/lichess-puzzler, AGPL-3.0, at commit 8e24b6d).
 *
 * The port keeps the original's rules, quirks included, because its labels are what a theme found
 * here is matched against: a detector that is "more right" than lichess' would point at puzzles
 * that train something else. Where the original leans on an accident of Python, a comment says so.
 */
import {
  squareAt,
  squareCoords,
  squareDistance,
  squaresBetween,
  type BoardView,
  type Color,
  type Role,
  type SquareName,
} from '@pawnia/chess'
import {
  attackedOpponentSquares,
  isAdvancedPawnMove,
  isCastling,
  isHanging,
  isInBadSpot,
  isRayPiece,
  isTrapped,
  isVeryAdvancedPawnMove,
  materialDiff,
  opposite,
  VALUES,
} from './boardFacts'
import { solverNodes, type LineNode, type TacticPuzzle } from './puzzle'
import type { Theme } from './themes'

/** The solver's moves from the second on, each with its index in the line. */
function laterSolverMoves(puzzle: TacticPuzzle): { node: LineNode; index: number }[] {
  const found: { node: LineNode; index: number }[] = []
  for (let index = 3; index < puzzle.mainline.length; index += 2) {
    found.push({ node: puzzle.mainline[index]!, index })
  }
  return found
}

function last(puzzle: TacticPuzzle): LineNode {
  return puzzle.mainline.at(-1)!
}

export function mateIn(puzzle: TacticPuzzle): Theme | undefined {
  if (!last(puzzle).after.isCheckmate()) return undefined
  const moves = puzzle.mainline.length / 2
  if (moves === 1) return 'mateIn1'
  if (moves === 2) return 'mateIn2'
  if (moves === 3) return 'mateIn3'
  if (moves === 4) return 'mateIn4'
  return 'mateIn5'
}

export function advancedPawn(puzzle: TacticPuzzle): boolean {
  return solverNodes(puzzle).some((node) => isVeryAdvancedPawnMove(node, puzzle.pov))
}

export function doubleCheck(puzzle: TacticPuzzle): boolean {
  return solverNodes(puzzle).some((node) => node.after.checkers().length > 1)
}

/** The solver is at least two pawns down, after a move of their own, on where the line began. */
export function sacrifice(puzzle: TacticPuzzle): boolean {
  const initial = materialDiff(puzzle.mainline[0]!.after, puzzle.pov)
  for (const { node } of laterSolverMoves(puzzle)) {
    if (materialDiff(node.after, puzzle.pov) - initial <= -2) {
      // Material lost to the opponent's new queen is no sacrifice.
      return !puzzle.mainline.some((n, index) => index >= 2 && index % 2 === 0 && n.promotion)
    }
  }
  return false
}

export function xRay(puzzle: TacticPuzzle): boolean {
  for (const { node, index } of laterSolverMoves(puzzle)) {
    if (!node.isCapture) continue
    const reply = puzzle.mainline[index - 1]!
    if (reply.to !== node.to || reply.moved === 'king') continue
    const before = puzzle.mainline[index - 2]!
    if (before.to !== reply.to) continue
    if (squaresBetween(node.from, node.to).includes(reply.from)) return true
  }
  return false
}

export function fork(puzzle: TacticPuzzle): boolean {
  for (const node of solverNodes(puzzle).slice(0, -1)) {
    const board = node.after
    if (isInBadSpot(board, node.to)) continue
    let targets = 0
    for (const { piece, square } of attackedOpponentSquares(board, node.to, puzzle.pov)) {
      if (piece.role === 'pawn') continue
      if (
        VALUES[piece.role] > VALUES[node.moved] ||
        (isHanging(board, piece, square) &&
          !board.attackers(node.to, opposite(puzzle.pov)).includes(square))
      ) {
        targets++
      }
    }
    if (targets > 1) return true
  }
  return false
}

export function hangingPiece(puzzle: TacticPuzzle): boolean {
  const [setup, first] = puzzle.mainline
  const board = setup!.after
  const to = first!.to
  const captured = board.pieceAt(to)
  if (!captured || captured.role === 'pawn') return false
  if (!isHanging(board, captured, to)) return false
  // Taking back a piece that just took something as valuable is a trade, not a find.
  const setupCapture = puzzle.start.pieceAt(setup!.to)
  if (setupCapture && VALUES[setupCapture.role] >= VALUES[captured.role] && setup!.to === to) {
    return false
  }
  if (puzzle.mainline.length < 4) return true
  return (
    materialDiff(puzzle.mainline[3]!.after, puzzle.pov) >= materialDiff(first!.after, puzzle.pov)
  )
}

export function trappedPiece(puzzle: TacticPuzzle): boolean {
  for (const { node, index } of laterSolverMoves(puzzle)) {
    if (!node.captured || node.captured === 'pawn') continue
    const reply = puzzle.mainline[index - 1]!
    // Where the piece stood before the opponent's last move: it may have tried to get away.
    const square = reply.to === node.to ? reply.from : node.to
    if (isTrapped(reply.before, square)) return true
  }
  return false
}

export function discoveredCheck(puzzle: TacticPuzzle): boolean {
  return solverNodes(puzzle).some((node) => {
    const checkers = node.after.checkers()
    return checkers.length > 0 && !checkers.includes(node.to)
  })
}

export function discoveredAttack(puzzle: TacticPuzzle): boolean {
  if (discoveredCheck(puzzle)) return true
  for (const { node, index } of laterSolverMoves(puzzle)) {
    if (!node.isCapture) continue
    // The original gives up at the first recapture instead of looking further.
    if (puzzle.mainline[index - 1]!.to === node.to) return false
    const opener = puzzle.mainline[index - 2]!
    if (
      squaresBetween(node.from, node.to).includes(opener.from) &&
      node.to !== opener.to &&
      node.from !== opener.to &&
      !isCastling(opener)
    ) {
      return true
    }
  }
  return false
}

export function quietMove(puzzle: TacticPuzzle): boolean {
  return solverNodes(puzzle)
    .slice(0, -1)
    .some(
      (node) =>
        !node.after.isCheck() &&
        !node.before.isCheck() &&
        !node.isCapture &&
        attackedOpponentSquares(node.after, node.to, puzzle.pov).length === 0 &&
        !isAdvancedPawnMove(node, puzzle.pov) &&
        node.moved !== 'king',
    )
}

/** Like a quiet move, but as the last move of the line. */
export function defensiveMove(puzzle: TacticPuzzle): boolean {
  const node = last(puzzle)
  if (node.before.legalMoves().length < 3) return false
  if (node.after.isCheck() || node.isCapture) return false
  if (attackedOpponentSquares(node.after, node.to, puzzle.pov).length > 0) return false
  return !isAdvancedPawnMove(node, puzzle.pov)
}

export function checkEscape(puzzle: TacticPuzzle): boolean {
  for (const node of solverNodes(puzzle)) {
    if (node.after.isCheck() || node.isCapture) return false
    if (node.before.legalMoves().length < 3) return false
    if (node.before.isCheck()) return true
  }
  return false
}

/**
 * The solver moves to a square, the opponent's king, queen or rook takes there, and the solver
 * then attacks that square: with check if it is the king, or to take on it a move later.
 */
export function attraction(puzzle: TacticPuzzle): boolean {
  const { mainline } = puzzle
  for (let index = 1; index < mainline.length; index += 2) {
    const lure = mainline[index]!
    const reply = mainline[index + 1]
    if (!reply || reply.to !== lure.to) continue
    if (reply.moved !== 'king' && reply.moved !== 'queen' && reply.moved !== 'rook') continue
    const next = mainline[index + 2]
    if (!next || !next.after.attackers(reply.to, puzzle.pov).includes(next.to)) continue
    if (reply.moved === 'king') return true
    if (mainline[index + 4]?.to === reply.to) return true
  }
  return false
}

/** Python's piece type numbers, which one comparison of the original uses in place of values. */
const PIECE_TYPE: Record<Role, number> = {
  pawn: 1,
  knight: 2,
  bishop: 3,
  rook: 4,
  queen: 5,
  king: 6,
}

/**
 * The solver's move draws a defender away (it must take, or get out of check), and the solver
 * then takes or promotes on a square that piece was guarding and no longer guards.
 */
export function deflection(puzzle: TacticPuzzle): boolean {
  for (const { node, index } of laterSolverMoves(puzzle)) {
    if (!node.captured && !node.promotion) continue
    if (node.captured && VALUES[node.captured] > VALUES[node.moved]) continue
    const reply = puzzle.mainline[index - 1]!
    const decoy = puzzle.mainline[index - 2]!
    if (
      // The original compares the captured piece's value with the capturing piece's type number
      // (not its value); kept, because lichess' labels come from that comparison.
      (!decoy.captured || VALUES[decoy.captured] < PIECE_TYPE[decoy.moved]) &&
      node.to !== reply.to &&
      node.to !== decoy.to &&
      (reply.to === decoy.to || decoy.after.isCheck()) &&
      (decoy.after.attacksFrom(reply.from).includes(node.to) ||
        (node.promotion !== undefined &&
          node.to[0] === reply.from[0] &&
          decoy.after.attacksFrom(reply.from).includes(node.from))) &&
      !node.before.attacksFrom(reply.to).includes(node.to)
    ) {
      return true
    }
  }
  return false
}

/** The opponent's king is far up the board without pawns in front, and gets checked on the way. */
export function exposedKing(puzzle: TacticPuzzle): boolean {
  const board = puzzle.mainline[0]!.after
  const king = board.kingOf(opposite(puzzle.pov))
  if (!king) return false
  const { file, rank } = squareCoords(king)
  // "In front" is towards the solver's side of the board.
  const forward = puzzle.pov === 'white' ? -1 : 1
  const advanced = puzzle.pov === 'white' ? rank >= 5 : rank <= 2
  if (!advanced) return false
  const shield = [
    squareAt(file, rank + forward),
    squareAt(file - 1, rank),
    squareAt(file - 1, rank + forward),
    squareAt(file + 1, rank),
    squareAt(file + 1, rank + forward),
  ]
  for (const square of shield) {
    const piece = square && board.pieceAt(square)
    if (piece && piece.role === 'pawn' && piece.color !== puzzle.pov) return false
  }
  return solverNodes(puzzle)
    .slice(1, -1)
    .some((node) => node.after.isCheck())
}

/** A piece steps off a line and the solver's rook, bishop or queen takes the lesser one behind. */
export function skewer(puzzle: TacticPuzzle): boolean {
  for (const { node, index } of laterSolverMoves(puzzle)) {
    if (!node.captured || !isRayPiece(node.moved) || node.after.isCheckmate()) continue
    const reply = puzzle.mainline[index - 1]!
    if (reply.to === node.to || !squaresBetween(node.from, node.to).includes(reply.from)) continue
    if (VALUES[reply.moved] > VALUES[node.captured] && isInBadSpot(reply.after, node.to)) {
      return true
    }
  }
  return false
}

/**
 * The defender of a square the solver takes on. The original looks only at the first one, counted
 * from a1, and that is kept. It also overlooks a defender standing on a1 itself (square 0 is
 * false in Python), which is not: that only drops real cases, 11 of 481 on a sample of puzzles.
 */
function rayDefender(board: BoardView, square: SquareName, color: Color): SquareName | undefined {
  const defender = board.attackers(square, color)[0]
  const role = defender && board.pieceAt(defender)?.role
  return role && isRayPiece(role) ? defender : undefined
}

/** The opponent's own move blocks the line of a piece that defended what the solver then takes. */
export function selfInterference(puzzle: TacticPuzzle): boolean {
  for (const { node, index } of laterSolverMoves(puzzle)) {
    const capture = node.before.pieceAt(node.to)
    if (!capture || !isHanging(node.before, capture, node.to)) continue
    const reply = puzzle.mainline[index - 1]!
    const defender = rayDefender(reply.before, node.to, capture.color)
    if (defender && squaresBetween(node.to, defender).includes(reply.to)) return true
  }
  return false
}

/** The solver's move blocks the line of a piece that defended what the solver then takes. */
export function interference(puzzle: TacticPuzzle): boolean {
  for (const { node, index } of laterSolverMoves(puzzle)) {
    const capture = node.before.pieceAt(node.to)
    const reply = puzzle.mainline[index - 1]!
    if (!capture || node.to === reply.to || !isHanging(node.before, capture, node.to)) continue
    const blocker = puzzle.mainline[index - 2]!
    const defender = rayDefender(blocker.before, node.to, capture.color)
    if (defender && squaresBetween(node.to, defender).includes(blocker.to)) return true
  }
  return false
}

/** Instead of taking back at once, the solver plays another move first and takes back after. */
export function intermezzo(puzzle: TacticPuzzle): boolean {
  for (const { node, index } of laterSolverMoves(puzzle)) {
    if (!node.isCapture) continue
    const reply = puzzle.mainline[index - 1]!
    const between = puzzle.mainline[index - 2]!
    if (between.after.attackers(node.to, opposite(puzzle.pov)).includes(reply.from)) continue
    if (between.to === node.to) continue
    const earlier = puzzle.mainline[index - 3]!
    return (
      earlier.to === node.to &&
      earlier.isCapture &&
      earlier.after
        .legalMoves()
        .some(
          (move) =>
            move.from === node.from &&
            move.to === node.to &&
            (move.promotion ?? undefined) === (node.promotion ?? undefined),
        )
    )
  }
  return false
}

/** A pinned piece of the opponent's would otherwise take something of the solver's. */
export function pinPreventsAttack(puzzle: TacticPuzzle): boolean {
  for (const node of solverNodes(puzzle)) {
    const board = node.after
    for (const { square, piece } of board.pieces()) {
      if (piece.color === puzzle.pov) continue
      const pin = board.pinLine(square)
      if (!pin) continue
      for (const target of board.attacksFrom(square)) {
        const attacked = board.pieceAt(target)
        if (
          attacked &&
          attacked.color === puzzle.pov &&
          !pin.includes(target) &&
          (VALUES[attacked.role] > VALUES[piece.role] || isHanging(board, attacked, target))
        ) {
          return true
        }
      }
    }
  }
  return false
}

/** A pinned piece of the opponent's is attacked along the pin and can't step away. */
export function pinPreventsEscape(puzzle: TacticPuzzle): boolean {
  for (const node of solverNodes(puzzle)) {
    const board = node.after
    for (const { square, piece } of board.pieces()) {
      if (piece.color === puzzle.pov) continue
      const pin = board.pinLine(square)
      if (!pin) continue
      for (const attacker of board.attackers(square, puzzle.pov)) {
        if (!pin.includes(attacker)) continue
        const role = board.pieceAt(attacker)!.role
        if (VALUES[piece.role] > VALUES[role]) return true
        if (
          isHanging(board, piece, square) &&
          !board.attackers(attacker, opposite(puzzle.pov)).includes(square) &&
          board.pseudoLegalDests(square).some((to) => !pin.includes(to))
        ) {
          return true
        }
      }
    }
  }
  return false
}

export function attackingF2F7(puzzle: TacticPuzzle): boolean {
  for (const node of solverNodes(puzzle)) {
    if (!node.captured || (node.to !== 'f2' && node.to !== 'f7')) continue
    const king = node.after.pieceAt(node.to === 'f7' ? 'e8' : 'e1')
    return king?.role === 'king' && king.color !== puzzle.pov
  }
  return false
}

function sideAttack(
  puzzle: TacticPuzzle,
  cornerFile: number,
  kingFiles: readonly number[],
  minPieces: number,
): boolean {
  const backRank = puzzle.pov === 'white' ? 7 : 0
  const board = puzzle.mainline[0]!.after
  const king = board.kingOf(opposite(puzzle.pov))
  // The original takes a king on a1 (square 0 in Python) for no king at all.
  if (!king || king === 'a1') return false
  const { file, rank } = squareCoords(king)
  const solver = solverNodes(puzzle)
  if (
    rank !== backRank ||
    !kingFiles.includes(file) ||
    board.pieces().length < minPieces ||
    !solver.some((node) => node.after.isCheck())
  ) {
    return false
  }
  const corner = squareAt(cornerFile, backRank)!
  let score = 0
  for (const node of solver) {
    const distance = squareDistance(corner, node.to)
    if (node.after.isCheck()) score++
    if (node.isCapture && distance <= 3) score++
    else if (distance >= 5) score--
  }
  return score >= 2
}

export function kingsideAttack(puzzle: TacticPuzzle): boolean {
  return sideAttack(puzzle, 7, [6, 7], 20)
}

export function queensideAttack(puzzle: TacticPuzzle): boolean {
  return sideAttack(puzzle, 0, [0, 1, 2], 18)
}

/** A piece moves out of the way, and a rook, bishop or queen then uses the square or line. */
export function clearance(puzzle: TacticPuzzle): boolean {
  for (const { node, index } of laterSolverMoves(puzzle)) {
    if (node.before.pieceAt(node.to) || !isRayPiece(node.moved)) continue
    const reply = puzzle.mainline[index - 1]!
    const clearing = puzzle.mainline[index - 2]!
    if (
      clearing.promotion ||
      clearing.to === node.from ||
      clearing.to === node.to ||
      reply.after.isCheck() ||
      (node.after.isCheck() && reply.moved === 'king')
    ) {
      continue
    }
    if (
      (clearing.from === node.to || squaresBetween(node.from, node.to).includes(clearing.from)) &&
      (!clearing.before.pieceAt(clearing.to) || isInBadSpot(clearing.after, clearing.to))
    ) {
      return true
    }
  }
  return false
}

export function enPassant(puzzle: TacticPuzzle): boolean {
  return solverNodes(puzzle).some(
    (node) => node.moved === 'pawn' && node.from[0] !== node.to[0] && !node.captured,
  )
}

export function castling(puzzle: TacticPuzzle): boolean {
  return solverNodes(puzzle).some(isCastling)
}

export function promotion(puzzle: TacticPuzzle): boolean {
  return solverNodes(puzzle).some((node) => node.promotion !== undefined)
}

/** A rook, bishop or knight promotion; a knight when it mates (a queen would do for the others). */
export function underPromotion(puzzle: TacticPuzzle): boolean {
  for (const node of solverNodes(puzzle)) {
    if (node.after.isCheckmate()) return node.promotion === 'knight'
    if (node.promotion && node.promotion !== 'queen') return true
  }
  return false
}

/** The solver takes a piece that guarded a square, and then takes (or mates) there. */
export function capturingDefender(puzzle: TacticPuzzle): boolean {
  for (const { node, index } of laterSolverMoves(puzzle)) {
    const capture = node.before.pieceAt(node.to)
    const reply = puzzle.mainline[index - 1]!
    const wins =
      node.after.isCheckmate() ||
      (capture !== undefined &&
        node.moved !== 'king' &&
        VALUES[capture.role] <= VALUES[node.moved] &&
        isHanging(node.before, capture, node.to) &&
        reply.to !== node.to)
    if (!wins) continue
    const removal = puzzle.mainline[index - 2]!
    if (removal.after.isCheck() || removal.to === node.from) continue
    const defender = removal.before.pieceAt(removal.to)
    if (
      defender &&
      removal.before.attackers(node.to, defender.color).includes(removal.to) &&
      !removal.before.isCheck()
    ) {
      return true
    }
  }
  return false
}

function matedKing(puzzle: TacticPuzzle): { board: BoardView; king: SquareName } | undefined {
  const board = last(puzzle).after
  const king = board.kingOf(opposite(puzzle.pov))
  return king && { board, king }
}

function neighbours(square: SquareName): SquareName[] {
  const { file, rank } = squareCoords(square)
  const found: SquareName[] = []
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      const near = df === 0 && dr === 0 ? undefined : squareAt(file + df, rank + dr)
      if (near) found.push(near)
    }
  }
  return found
}

/** A rook or queen mates along the back rank, the king shut in by its own pieces. */
export function backRankMate(puzzle: TacticPuzzle): boolean {
  const mated = matedKing(puzzle)
  if (!mated || !mated.board.isCheckmate()) return false
  const { board, king } = mated
  const { file, rank } = squareCoords(king)
  const backRank = puzzle.pov === 'white' ? 7 : 0
  if (rank !== backRank) return false
  const forward = puzzle.pov === 'white' ? -1 : 1
  for (const df of [-1, 0, 1]) {
    const square = squareAt(file + df, rank + forward)
    if (!square) continue
    const piece = board.pieceAt(square)
    // Each square in front holds one of the king's own pieces, and the solver doesn't cover it.
    if (!piece || piece.color === puzzle.pov || board.attackers(square, puzzle.pov).length > 0) {
      return false
    }
  }
  return board.checkers().some((checker) => squareCoords(checker).rank === backRank)
}

/** A knight mates a king that has no free square next to it. */
export function smotheredMate(puzzle: TacticPuzzle): boolean {
  const mated = matedKing(puzzle)
  if (!mated) return false
  const { board, king } = mated
  for (const checker of board.checkers()) {
    if (board.pieceAt(checker)?.role !== 'knight') continue
    return neighbours(king).every((square) => {
      const blocker = board.pieceAt(square)
      return blocker !== undefined && blocker.color !== puzzle.pov
    })
  }
  return false
}

/** Rook or queen on the edge file, a knight two files in keeping the king there. */
export function anastasiaMate(puzzle: TacticPuzzle): boolean {
  const mated = matedKing(puzzle)
  if (!mated) return false
  const { board, king } = mated
  const node = last(puzzle)
  const { file, rank } = squareCoords(king)
  if ((file !== 0 && file !== 7) || rank === 0 || rank === 7) return false
  if (node.to[0] !== king[0] || (node.moved !== 'queen' && node.moved !== 'rook')) return false
  const inward = file === 0 ? 1 : -1
  const blocker = board.pieceAt(squareAt(file + inward, rank)!)
  if (!blocker || blocker.color === puzzle.pov) return false
  const knight = board.pieceAt(squareAt(file + 3 * inward, rank)!)
  return knight?.color === puzzle.pov && knight.role === 'knight'
}

/** A rook next to the king, held by a knight that a pawn holds in turn. */
export function hookMate(puzzle: TacticPuzzle): boolean {
  const mated = matedKing(puzzle)
  if (!mated) return false
  const { board, king } = mated
  const node = last(puzzle)
  if (node.moved !== 'rook' || squareDistance(node.to, king) !== 1) return false
  for (const knightSquare of board.attackers(node.to, puzzle.pov)) {
    if (board.pieceAt(knightSquare)?.role !== 'knight') continue
    if (squareDistance(knightSquare, king) !== 1) continue
    for (const pawnSquare of board.attackers(knightSquare, puzzle.pov)) {
      if (board.pieceAt(pawnSquare)?.role === 'pawn') return true
    }
  }
  return false
}

/** King in the corner, a rook next to it held by a knight two squares away diagonally. */
export function arabianMate(puzzle: TacticPuzzle): boolean {
  const mated = matedKing(puzzle)
  if (!mated) return false
  const { board, king } = mated
  const node = last(puzzle)
  const corner = squareCoords(king)
  if ((corner.file !== 0 && corner.file !== 7) || (corner.rank !== 0 && corner.rank !== 7)) {
    return false
  }
  if (node.moved !== 'rook' || squareDistance(node.to, king) !== 1) return false
  return board.attackers(node.to, puzzle.pov).some((square) => {
    if (board.pieceAt(square)?.role !== 'knight') return false
    const knight = squareCoords(square)
    return Math.abs(knight.rank - corner.rank) === 2 && Math.abs(knight.file - corner.file) === 2
  })
}

/** Two bishops alone cover the king and its squares: criss-cross (Boden) or side by side. */
export function bodenOrDoubleBishopMate(puzzle: TacticPuzzle): Theme | undefined {
  const mated = matedKing(puzzle)
  if (!mated) return undefined
  const { board, king } = mated
  const bishops = board
    .pieces()
    .filter(({ piece }) => piece.role === 'bishop' && piece.color === puzzle.pov)
    .map(({ square }) => squareCoords(square).file)
  if (bishops.length < 2) return undefined
  for (const square of [king, ...neighbours(king)]) {
    const onlyBishops = board
      .attackers(square, puzzle.pov)
      .every((attacker) => board.pieceAt(attacker)?.role === 'bishop')
    if (!onlyBishops) return undefined
  }
  const kingFile = squareCoords(king).file
  return bishops[0]! < kingFile === bishops[1]! > kingFile ? 'bodenMate' : 'doubleBishopMate'
}

/** A queen diagonally next to the king; its own pieces take the squares she doesn't cover. */
export function dovetailMate(puzzle: TacticPuzzle): boolean {
  const mated = matedKing(puzzle)
  if (!mated) return false
  const { board, king } = mated
  const node = last(puzzle)
  const { file, rank } = squareCoords(king)
  if (file === 0 || file === 7 || rank === 0 || rank === 7) return false
  const queen = node.to
  if (
    node.moved !== 'queen' ||
    queen[0] === king[0] ||
    queen[1] === king[1] ||
    squareDistance(queen, king) > 1
  ) {
    return false
  }
  for (const square of neighbours(king)) {
    if (square === queen) continue
    const attackers = board.attackers(square, puzzle.pov)
    if (attackers.length === 1 && attackers[0] === queen) {
      if (board.pieceAt(square)) return false
    } else if (attackers.length > 0) {
      return false
    }
  }
  return true
}

/** Only kings, pawns and pieces of one kind are on the board, at least one of that kind. */
export function pieceEndgame(puzzle: TacticPuzzle, role: Role): boolean {
  return puzzle.mainline.slice(0, 2).every((node) => {
    const pieces = node.after.pieces()
    return (
      pieces.some(({ piece }) => piece.role === role) &&
      pieces.every(({ piece }) => ['king', 'pawn', role].includes(piece.role))
    )
  })
}

export function queenRookEndgame(puzzle: TacticPuzzle): boolean {
  return puzzle.mainline.slice(0, 2).every((node) => {
    const roles = node.after.pieces().map(({ piece }) => piece.role)
    return (
      roles.filter((role) => role === 'queen').length === 1 &&
      roles.includes('rook') &&
      roles.every((role) => ['queen', 'rook', 'pawn', 'king'].includes(role))
    )
  })
}
