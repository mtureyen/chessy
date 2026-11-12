import * as detect from './detectors'
import { cutEngineLine } from './engineLine'
import { replayLine, type TacticLine, type TacticPuzzle } from './puzzle'
import type { Theme } from './themes'

/**
 * The themes that are relied on: `tagThemes` returns only these.
 *
 * On lichess' own puzzles every detector gives lichess' labels (99.6 % or more of what each one
 * tags, on 41,501 puzzles kept apart for the report; two rare themes less). What separates them
 * is how they do on an engine's line instead of a puzzle's solution, which is what a game review
 * has, and whether they name something to practise. Agreement with lichess' labels on the cut
 * engine lines of 4,000 of those puzzles (`bun run --cwd apps/api themes:validate --engine`):
 *  - the mates 100 %, sacrifice 98 %, hanging piece 95 %, pin 92 %, fork and discovered attack
 *    91 %, attraction 88 %, advanced pawn 85 %, deflection 83 %;
 *  - intermezzo 81 %, double check 78 %, skewer 75 %, trapped piece 69 %, promotion 54 %. These
 *    are in all the same: the lines they disagree on were read by hand (on the puzzles used for
 *    tuning) and nearly all hold the theme. The engine's line runs a move or two past the
 *    puzzle's solution, to the capture that completes the skewer, the trapped piece being taken
 *    or the pawn that actually queens, and lichess' labels end where its solution ends.
 * Left out:
 *  - capturingDefender (65 %): on engine lines it mostly fires after the main capture, for
 *    whatever that piece happened to guard;
 *  - interference, xRayAttack, clearance, underPromotion: too rare to judge on engine lines;
 *  - quietMove, defensiveMove, castling, enPassant: they describe a move, not a pattern;
 *  - exposedKing, kingsideAttack, queensideAttack, attackingF2F7 and the endgame kinds: they
 *    say where a tactic happens, not what it is;
 *  - mate: every mate already has its `mateIn…`.
 */
export const TRUSTED_THEMES: readonly Theme[] = [
  'mateIn1',
  'mateIn2',
  'mateIn3',
  'mateIn4',
  'mateIn5',
  'smotheredMate',
  'backRankMate',
  'anastasiaMate',
  'hookMate',
  'arabianMate',
  'bodenMate',
  'doubleBishopMate',
  'dovetailMate',
  'attraction',
  'deflection',
  'advancedPawn',
  'doubleCheck',
  'sacrifice',
  'fork',
  'hangingPiece',
  'trappedPiece',
  'discoveredAttack',
  'skewer',
  'intermezzo',
  'pin',
  'promotion',
]

/**
 * The themes of a tactic, in lichess' vocabulary and order: the ones in `TRUSTED_THEMES`.
 * The line is the tactic itself, like a puzzle's solution; for an engine's line, which runs on
 * past the tactic, use `engineLineThemes`.
 */
export function tagThemes(line: TacticLine): Theme[] {
  return allThemes(line).filter((theme) => TRUSTED_THEMES.includes(theme))
}

/** The themes of the tactic inside an engine line; none if the line wins nothing tangible. */
export function engineLineThemes(line: TacticLine): Theme[] {
  const tactic = cutEngineLine(line)
  return tactic ? tagThemes(tactic) : []
}

/**
 * Every theme lichess' tagger would give a line, in its order. Empty if the line can't be played.
 * For anything shown to a user, take `tagThemes`: not all of these are reliable.
 */
export function allThemes(line: TacticLine): Theme[] {
  const puzzle = replayLine(line)
  return puzzle ? cook(puzzle) : []
}

/** `cook()` of lichess-puzzler, without the tags that describe the evaluation or the length. */
function cook(puzzle: TacticPuzzle): Theme[] {
  const tags: Theme[] = []

  const mate = detect.mateIn(puzzle)
  if (mate) {
    tags.push(mate, 'mate')
    // One name per mate, the most specific first.
    if (detect.smotheredMate(puzzle)) tags.push('smotheredMate')
    else if (detect.backRankMate(puzzle)) tags.push('backRankMate')
    else if (detect.anastasiaMate(puzzle)) tags.push('anastasiaMate')
    else if (detect.hookMate(puzzle)) tags.push('hookMate')
    else if (detect.arabianMate(puzzle)) tags.push('arabianMate')
    else {
      const bishops = detect.bodenOrDoubleBishopMate(puzzle)
      if (bishops) tags.push(bishops)
      else if (detect.dovetailMate(puzzle)) tags.push('dovetailMate')
    }
  }

  if (detect.attraction(puzzle)) tags.push('attraction')
  if (detect.deflection(puzzle)) tags.push('deflection')
  if (detect.advancedPawn(puzzle)) tags.push('advancedPawn')
  if (detect.doubleCheck(puzzle)) tags.push('doubleCheck')
  if (detect.quietMove(puzzle)) tags.push('quietMove')
  if (detect.defensiveMove(puzzle) || detect.checkEscape(puzzle)) tags.push('defensiveMove')
  if (detect.sacrifice(puzzle)) tags.push('sacrifice')
  if (detect.xRay(puzzle)) tags.push('xRayAttack')
  if (detect.fork(puzzle)) tags.push('fork')
  if (detect.hangingPiece(puzzle)) tags.push('hangingPiece')
  if (detect.trappedPiece(puzzle)) tags.push('trappedPiece')
  if (detect.discoveredAttack(puzzle)) tags.push('discoveredAttack')
  if (detect.exposedKing(puzzle)) tags.push('exposedKing')
  if (detect.skewer(puzzle)) tags.push('skewer')
  if (detect.selfInterference(puzzle) || detect.interference(puzzle)) tags.push('interference')
  if (detect.intermezzo(puzzle)) tags.push('intermezzo')
  if (detect.pinPreventsAttack(puzzle) || detect.pinPreventsEscape(puzzle)) tags.push('pin')
  if (detect.attackingF2F7(puzzle)) tags.push('attackingF2F7')
  if (detect.clearance(puzzle)) tags.push('clearance')
  if (detect.enPassant(puzzle)) tags.push('enPassant')
  if (detect.castling(puzzle)) tags.push('castling')
  if (detect.promotion(puzzle)) tags.push('promotion')
  if (detect.underPromotion(puzzle)) tags.push('underPromotion')
  if (detect.capturingDefender(puzzle)) tags.push('capturingDefender')

  if (detect.pieceEndgame(puzzle, 'pawn')) tags.push('pawnEndgame')
  else if (detect.pieceEndgame(puzzle, 'queen')) tags.push('queenEndgame')
  else if (detect.pieceEndgame(puzzle, 'rook')) tags.push('rookEndgame')
  else if (detect.pieceEndgame(puzzle, 'bishop')) tags.push('bishopEndgame')
  else if (detect.pieceEndgame(puzzle, 'knight')) tags.push('knightEndgame')
  else if (detect.queenRookEndgame(puzzle)) tags.push('queenRookEndgame')

  if (!tags.includes('backRankMate') && !tags.includes('fork')) {
    if (detect.kingsideAttack(puzzle)) tags.push('kingsideAttack')
    else if (detect.queensideAttack(puzzle)) tags.push('queensideAttack')
  }

  return tags
}
