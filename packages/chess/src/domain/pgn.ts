import { INITIAL_FEN, makeFen } from 'chessops/fen'
import {
  ChildNode,
  defaultGame,
  defaultHeaders,
  emptyHeaders,
  makeComment,
  makeOutcome,
  makePgn,
  parseComment,
  parsePgn,
  startingPosition,
  type Node as PgnNode,
  type PgnNodeData,
} from 'chessops/pgn'
import { createGame, type GameState } from './game'
import type { GameStatus, MoveNode } from './types'

export type PgnHeaders = Record<string, string>

export interface ImportedGame {
  game: GameState
  headers: PgnHeaders
}

export class PgnImportError extends Error {}

/** Parses the first game of a PGN, including all variations. The cursor ends on the last mainline move. */
export function importPgn(pgn: string): ImportedGame {
  const [parsed] = parsePgn(pgn, emptyHeaders)
  if (!parsed || (parsed.headers.size === 0 && parsed.moves.children.length === 0))
    throw new PgnImportError('No game found in PGN')

  const start = startingPosition(parsed.headers)
  if (start.isErr) throw new PgnImportError(`Invalid starting position (${start.error.message})`)
  if (start.value.rules !== 'chess')
    throw new PgnImportError(`Unsupported variant: ${start.value.rules}`)

  const game = createGame(makeFen(start.value.toSetup()))
  game.annotate(game.root, readComments(parsed.comments))
  addVariations(game, game.root, parsed.moves)
  game.toStart()
  game.toEnd()
  return { game, headers: Object.fromEntries(parsed.headers) }
}

function addVariations(game: GameState, from: MoveNode, source: PgnNode<PgnNodeData>): void {
  for (const child of source.children) {
    game.goTo(from)
    const node = game.play(child.data.san)
    if (!node)
      throw new PgnImportError(`Illegal move in PGN at ply ${from.ply + 1}: ${child.data.san}`)
    game.annotate(node, readComments(child.data.comments))
    addVariations(game, node, child)
  }
}

export function exportPgn(game: GameState, headers: PgnHeaders = {}): string {
  const out = defaultGame<PgnNodeData>(defaultHeaders)
  for (const [key, value] of Object.entries(headers)) out.headers.set(key, value)

  out.headers.delete('SetUp')
  out.headers.delete('FEN')
  if (game.root.fen !== INITIAL_FEN) {
    out.headers.set('SetUp', '1')
    out.headers.set('FEN', game.root.fen)
  }

  const result = resultOf(game.status(mainlineEnd(game.root)))
  if (result) out.headers.set('Result', result)

  const gameComment = writeComment(game.root)
  if (gameComment) out.comments = [gameComment]
  copyTree(game.root, out.moves)
  return makePgn(out)
}

function copyTree(from: MoveNode, to: PgnNode<PgnNodeData>): void {
  for (const child of from.children) {
    const comment = writeComment(child)
    const node = new ChildNode<PgnNodeData>(
      comment ? { san: child.move!.san, comments: [comment] } : { san: child.move!.san },
    )
    to.children.push(node)
    copyTree(child, node)
  }
}

/** Splits raw PGN comments into readable text and the `[%clk]` value. */
function readComments(raw: string[] | undefined): { comments: string[]; clock?: number } {
  const comments: string[] = []
  let clock: number | undefined
  for (const parsed of (raw ?? []).map(parseComment)) {
    if (parsed.text) comments.push(parsed.text)
    if (parsed.clock !== undefined) clock = parsed.clock
  }
  return clock === undefined ? { comments } : { comments, clock }
}

function writeComment(node: MoveNode): string | undefined {
  const text = node.comments.join(' ')
  if (!text && node.clock === undefined) return undefined
  // makeComment puts a space before commands even without text; trim it.
  return makeComment(node.clock === undefined ? { text } : { text, clock: node.clock }).trim()
}

function mainlineEnd(root: MoveNode): MoveNode {
  let node = root
  while (node.children[0]) node = node.children[0]
  return node
}

/** PGN result for a decided game; undefined while ongoing (keeps e.g. a resignation from the headers). */
function resultOf(status: GameStatus): string | undefined {
  if (status.kind === 'checkmate') return makeOutcome({ winner: status.winner })
  if (status.kind === 'draw') return makeOutcome({ winner: undefined })
  return undefined
}
