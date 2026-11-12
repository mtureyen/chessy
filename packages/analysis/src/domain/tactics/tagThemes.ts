import * as detect from './detectors'
import { replayLine, type TacticLine, type TacticPuzzle } from './puzzle'
import type { Theme } from './themes'

/**
 * Every theme lichess' tagger would give a line, in its order. Empty if the line can't be played.
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
