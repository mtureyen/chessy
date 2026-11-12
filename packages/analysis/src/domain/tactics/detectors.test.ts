import { describe, expect, it } from 'vitest'
import { allThemes } from './tagThemes'

/** Themes of a line: the position before the opponent's move, then the moves in UCI. */
function themes(fen: string, moves: string): string[] {
  return allThemes({ fen, moves: moves.split(' ') })
}

describe('mates', () => {
  it('names a mate by the number of the solver’s moves', () => {
    // Black's rook steps off the back rank; Rd8 mates.
    const one = themes('6k1/5ppp/8/8/8/8/r4PPP/3R2K1 b - - 0 1', 'a2a5 d1d8')
    expect(one).toEqual(expect.arrayContaining(['mate', 'mateIn1']))
    // Rd8+ Rxd8 Rxd8#.
    const two = themes('r5k1/p4ppp/8/8/8/8/3R1PPP/3R2K1 b - - 0 1', 'a7a6 d2d8 a8d8 d1d8')
    expect(two).toContain('mateIn2')
    expect(two).not.toContain('mateIn1')
  })

  it('counts three moves to mate as mate in 3', () => {
    // lichess puzzle 00Kbj: ...Kg3, ...Ra1+ and ...Rxd1#.
    const three = themes(
      '8/8/6p1/PR3p2/1P3k2/7P/r5P1/7K w - - 1 39',
      'h3h4 f4g3 b5d5 a2a1 d5d1 a1d1',
    )
    expect(three).toContain('mateIn3')
    expect(three).not.toContain('mateIn2')
  })

  it('does not call a line a mate when the last move only checks', () => {
    // The h-pawn has moved: Rd8+ Kh7.
    expect(themes('6k1/5pp1/7p/8/8/8/r4PPP/3R2K1 b - - 0 1', 'a2a5 d1d8')).not.toContain('mate')
  })

  it('finds a back-rank mate: the king shut in by its own pawns', () => {
    const line = themes('6k1/5ppp/8/8/8/8/r4PPP/3R2K1 b - - 0 1', 'a2a5 d1d8')
    expect(line).toContain('backRankMate')
  })

  it('does not call it a back-rank mate when the solver covers the square in front', () => {
    // g7 is empty and held by the bishop on b2: a mate on the back rank, not a back-rank mate.
    const line = themes('6k1/5p1p/8/8/8/8/rB3PPP/3R2K1 b - - 0 1', 'a2a5 d1d8')
    expect(line).toContain('mateIn1')
    expect(line).not.toContain('backRankMate')
  })

  it('finds a smothered mate', () => {
    // Qg8+ Rxg8 Nf7#: every square around the king holds one of its own pieces.
    const line = themes('5r1k/p5pp/7N/8/8/1Q6/8/6K1 b - - 0 1', 'a7a6 b3g8 f8g8 h6f7')
    expect(line).toEqual(expect.arrayContaining(['mateIn2', 'smotheredMate', 'sacrifice']))
    expect(line).not.toContain('backRankMate')
  })

  it('does not call a knight’s mate smothered when a square next to the king is free', () => {
    // g8 is empty, and held by the second knight.
    const line = themes('7k/p3N1pp/8/6N1/8/8/8/6K1 b - - 0 1', 'a7a6 g5f7')
    expect(line).toContain('mateIn1')
    expect(line).not.toContain('smotheredMate')
  })
})

describe('fork', () => {
  it('finds a knight forking king and rook', () => {
    const line = themes('r2k4/8/8/3N4/8/8/8/4K3 b - - 0 1', 'd8e8 d5c7 e8d7 c7a8')
    expect(line).toContain('fork')
  })

  it('needs the forking piece to be safe', () => {
    // The bishop on e5 simply takes the knight on c7.
    const line = themes('r2k4/8/8/3Nb3/8/8/8/4K3 b - - 0 1', 'd8e8 d5c7 e5c7 e1e2')
    expect(line).not.toContain('fork')
  })

  it('needs a move after the fork: the last move of a line only threatens', () => {
    expect(themes('r2k4/8/8/3N4/8/8/8/4K3 b - - 0 1', 'd8e8 d5c7')).not.toContain('fork')
  })

  it('does not count pawns or defended pieces of no greater value as targets', () => {
    // Nd5 attacks the pawn on c7 and the knight on e7, which the king defends.
    const line = themes('3k4/2p1n3/8/8/1N2P3/8/8/4K3 b - - 0 1', 'd8d7 b4d5 e7d5 e4d5')
    expect(line).not.toContain('fork')
  })
})

describe('pin', () => {
  it('finds a pinned piece attacked by something cheaper', () => {
    // Bb2 pins the rook on f6 to the king on h8.
    const line = themes('7k/7p/5r2/8/8/8/8/2B1K3 b - - 0 1', 'h7h6 c1b2 h8g7 b2f6')
    expect(line).toContain('pin')
  })

  it('finds a pin that stops a recapture', () => {
    // Bxd4 opens the e-file: the pawn on e5 is pinned and can't take back.
    const line = themes('4k3/8/2n5/4p3/8/4B3/8/4R1K1 b - - 0 1', 'c6d4 e3d4')
    expect(line).toContain('pin')
  })

  it('does not see a pin when the king is not behind the piece', () => {
    expect(themes('5k2/8/2n5/4p3/8/4B3/8/4R1K1 b - - 0 1', 'c6d4 e3d4')).not.toContain('pin')
    // A rook attacked on the long diagonal with the king off it.
    const loose = themes('6k1/7p/5r2/8/8/8/8/2B1K3 b - - 0 1', 'h7h6 c1b2 g8g7 b2f6')
    expect(loose).not.toContain('pin')
  })
})

describe('skewer', () => {
  it('finds a check that wins the rook behind the king', () => {
    const line = themes('4k2r/7p/8/8/8/8/8/R3K3 b - - 0 1', 'h7h6 a1a8 e8e7 a8h8')
    expect(line).toContain('skewer')
  })

  it('does not call it a skewer when the piece behind is defended and worth no more', () => {
    const line = themes('4k2r/6bp/8/8/8/8/8/R3K3 b - - 0 1', 'h7h6 a1a8 e8e7 a8h8')
    expect(line).not.toContain('skewer')
  })

  it('does not call a plain capture along a line a skewer', () => {
    // Nothing stepped out of the way: the rook on h8 was simply attacked.
    const line = themes('7r/4k2p/8/8/8/8/8/R3K3 b - - 0 1', 'h7h6 a1a8 e7e6 a8h8')
    expect(line).not.toContain('skewer')
  })
})

describe('hangingPiece', () => {
  it('finds a piece moved to a square where it is taken for nothing', () => {
    expect(themes('4k3/8/5n2/8/8/8/8/3RK3 b - - 0 1', 'f6d5 d1d5')).toContain('hangingPiece')
  })

  it('does not count a defended piece', () => {
    expect(themes('4k3/8/4pn2/8/8/8/8/3RK3 b - - 0 1', 'f6d5 d1d5')).not.toContain('hangingPiece')
  })

  it('does not count taking back a piece that just took one', () => {
    expect(themes('4k3/8/5n2/3N4/8/8/8/3RK3 b - - 0 1', 'f6d5 d1d5')).not.toContain('hangingPiece')
  })

  it('does not count a pawn', () => {
    expect(themes('4k3/8/4p3/8/8/8/8/3RK3 b - - 0 1', 'e6e5 d1d5 e8e7 d5e5')).not.toContain(
      'hangingPiece',
    )
  })

  it('does not count it when the solver is no better off a move later', () => {
    // Rxd5 wins the knight, ...Bxe2 takes one back and the solver doesn't recapture.
    const fen = '4k3/8/5n2/8/6b1/8/4N3/3RK3 b - - 0 1'
    expect(themes(fen, 'f6d5 d1d5 g4e2 e1e2')).toContain('hangingPiece')
    expect(themes(fen, 'f6d5 d1d5 g4e2 d5d2')).not.toContain('hangingPiece')
  })
})

describe('discoveredAttack and doubleCheck', () => {
  it('finds a discovered check', () => {
    // The bishop leaves the e-file and takes the queen; the rook behind it gives check.
    const line = themes('q3k3/7p/8/8/4B3/8/8/4R1K1 b - - 0 1', 'h7h6 e4a8')
    expect(line).toContain('discoveredAttack')
    expect(line).not.toContain('doubleCheck')
  })

  it('finds a double check', () => {
    const line = themes('4k3/7p/8/8/4N3/8/8/4R1K1 b - - 0 1', 'h7h6 e4f6')
    expect(line).toContain('doubleCheck')
    // lichess takes a check for discovered only if the piece that moved gives none itself.
    expect(line).not.toContain('discoveredAttack')
    // The knight steps aside without checking: discovered, but a single check.
    const single = themes('4k3/7p/8/8/4N3/8/8/4R1K1 b - - 0 1', 'h7h6 e4c5')
    expect(single).toContain('discoveredAttack')
    expect(single).not.toContain('doubleCheck')
  })

  it('finds a piece that moves away so the one behind it can take', () => {
    // Bxg6 leaves the d-file; after fxg6 the rook behind it takes the queen.
    const line = themes('3q2k1/5pp1/8/8/8/3B4/8/3R2K1 b - - 0 1', 'g7g6 d3g6 f7g6 d1d8')
    expect(line).toContain('discoveredAttack')
  })

  it('does not see one in a direct check', () => {
    const line = themes('4k3/7p/8/8/8/8/8/3R2K1 b - - 0 1', 'h7h6 d1e1')
    expect(line).not.toContain('discoveredAttack')
    expect(line).not.toContain('doubleCheck')
  })
})

describe('deflection', () => {
  it('finds a defender drawn away by a piece it takes', () => {
    // The queen guards a8; Bd7 Qxd7 and the rook on a8 falls.
    const line = themes('r2q2k1/5ppp/8/1B6/8/8/5PPP/R5K1 b - - 0 1', 'h7h6 b5d7 d8d7 a1a8')
    expect(line).toContain('deflection')
  })

  it('does not see one when the defender still guards from its new square', () => {
    const line = themes('r2q2k1/5ppp/8/1B6/8/8/5PPP/R5K1 b - - 0 1', 'h7h6 b5e8 d8e8 a1a8')
    expect(line).not.toContain('deflection')
  })
})

describe('attraction', () => {
  it('finds a king drawn onto a square where it is checked', () => {
    // Rh8+ Kxh8, Nf7+ and the knight takes the queen.
    const line = themes('3q2k1/p5p1/8/6N1/8/8/8/6KR b - - 0 1', 'a7a6 h1h8 g8h8 g5f7 h8g8 f7d8')
    expect(line).toEqual(expect.arrayContaining(['attraction', 'fork', 'sacrifice']))
  })

  it('does not see one when the piece offered is not taken', () => {
    const line = themes('3q2k1/p5p1/8/6N1/8/8/8/6KR b - - 0 1', 'a7a6 h1h8 g8f7 h8d8')
    expect(line).not.toContain('attraction')
  })
})

describe('trappedPiece', () => {
  it('finds a piece with no safe square that is then taken', () => {
    // The knight in the corner: b3 is held by the pawn, c2 by the bishop.
    const line = themes('4k3/7p/8/8/8/3B4/P7/n1K5 b - - 0 1', 'h7h6 c1b2 h6h5 b2a1')
    expect(line).toContain('trappedPiece')
  })

  it('does not call a piece trapped that had a safe square', () => {
    // b3 is defended by the bishop on e6: the knight could have left.
    const line = themes('4k3/7p/4b3/8/8/3B4/8/n1K5 b - - 0 1', 'h7h6 c1b2 h6h5 b2a1')
    expect(line).not.toContain('trappedPiece')
  })
})

describe('capturingDefender', () => {
  it('finds the capture of a piece that guarded the one taken next', () => {
    // Bxf6 removes the knight that defends d5; after gxf6 the rook takes on d5.
    const line = themes('6k1/5ppp/5n2/3n2B1/8/8/5PPP/3R2K1 b - - 0 1', 'h7h6 g5f6 g7f6 d1d5')
    expect(line).toContain('capturingDefender')
  })

  it('does not see one when the piece taken next is still defended', () => {
    const line = themes('6k1/5ppp/4pn2/3n2B1/8/8/5PPP/3R2K1 b - - 0 1', 'h7h6 g5f6 g7f6 d1d5')
    expect(line).not.toContain('capturingDefender')
  })

  it('does not see one when the first capture is a check, as lichess doesn’t', () => {
    // Nxf3+ takes the bishop's defender with check, then Qxg5.
    const line = themes(
      'r1bqkbnr/pp1p1ppp/4p3/2p5/3nP3/2NP1N2/PPP2PPP/R1BQKB1R w KQkq - 3 5',
      'c1g5 d4f3 d1f3 d8g5',
    )
    expect(line).not.toContain('capturingDefender')
  })
})

describe('sacrifice', () => {
  it('needs the solver to be two pawns down after a move of their own', () => {
    // A rook for a rook is no sacrifice.
    const trade = themes('r5k1/p4ppp/8/8/8/8/3R1PPP/3R2K1 b - - 0 1', 'a7a6 d2d8 a8d8 d1d8')
    expect(trade).not.toContain('sacrifice')
  })

  it('does not count material lost to a promotion of the opponent’s', () => {
    // White gives a rook for the pawn that queens: forced, not a sacrifice.
    const line = themes('6k1/8/8/8/8/8/1p3PPP/1R4K1 w - - 0 1', 'g1h1 b2b1q b1b1')
    expect(line).not.toContain('sacrifice')
  })
})

describe('promotion and advancedPawn', () => {
  it('finds a promotion, which is also an advanced pawn', () => {
    const line = themes('8/4P3/8/6k1/8/8/8/4K3 b - - 0 1', 'g5g4 e7e8q')
    expect(line).toEqual(expect.arrayContaining(['promotion', 'advancedPawn']))
    expect(line).not.toContain('underPromotion')
  })

  it('finds a pawn reaching the seventh rank without promoting', () => {
    const line = themes('8/8/4P3/6k1/8/8/8/4K3 b - - 0 1', 'g5g4 e6e7')
    expect(line).toContain('advancedPawn')
    expect(line).not.toContain('promotion')
  })

  it('does not count a pawn on the sixth rank', () => {
    expect(themes('8/8/8/4P1k1/8/8/8/4K3 b - - 0 1', 'g5g4 e5e6')).not.toContain('advancedPawn')
  })

  it('counts from Black’s side too', () => {
    expect(themes('4k3/8/8/8/8/4p3/8/6K1 w - - 0 1', 'g1h1 e3e2')).toContain('advancedPawn')
  })

  it('finds an underpromotion', () => {
    const line = themes('8/4P3/8/6k1/8/8/8/4K3 b - - 0 1', 'g5g4 e7e8n')
    expect(line).toEqual(expect.arrayContaining(['promotion', 'underPromotion']))
  })
})

describe('allThemes', () => {
  it('returns nothing for a line that cannot be played', () => {
    expect(themes('4k3/8/8/8/8/8/8/3RK3 b - - 0 1', 'e8e7 d1h5')).toEqual([])
    expect(themes('not a position', 'e2e4 e7e5')).toEqual([])
  })

  it('returns nothing when the solver has no move', () => {
    expect(themes('4k3/8/8/8/8/8/8/3RK3 b - - 0 1', 'e8e7')).toEqual([])
    expect(themes('4k3/8/8/8/8/8/8/3RK3 b - - 0 1', '')).toEqual([])
  })

  it('leaves out a move of the opponent’s after the solver’s last', () => {
    const fen = '4k3/8/5n2/8/8/8/8/3RK3 b - - 0 1'
    expect(themes(fen, 'f6d5 d1d5 e8e7')).toEqual(themes(fen, 'f6d5 d1d5'))
  })

  // Puzzles of lichess' database (CC0) with its own labels, less the ones about evaluation,
  // game phase and length, which the tagger leaves out.
  it.each([
    [
      '000qP',
      '8/7R/8/5p2/4bk1P/8/2r2K2/6R1 w - - 7 51',
      'f2f1 f4f3 f1e1 c2c1 e1d2 c1g1',
      ['exposedKing', 'skewer'],
    ],
    [
      '00347',
      '8/2p5/8/2pPk2p/8/4K2P/6P1/8 w - - 1 42',
      'e3d3 h5h4 d3c4 e5d6',
      ['pawnEndgame', 'quietMove'],
    ],
    [
      '005Bm',
      '4rk2/p1q5/1p3Q1b/8/1p5N/2P1p3/P3P3/2K5 b - - 0 43',
      'c7f7 h4g6 f8g8 f6h8',
      ['mate', 'mateIn2', 'pin'],
    ],
    [
      '00Aae',
      '1R6/1P6/4pkp1/5p2/3P3p/3KP3/8/1r6 b - - 0 43',
      'h4h3 b8f8 f6e7 b7b8q b1b8 f8b8',
      ['advancedPawn', 'clearance', 'promotion', 'rookEndgame'],
    ],
    [
      '00H8a',
      '5bk1/2R4p/6p1/8/2b1NP1P/4P1K1/r7/8 b - - 2 45',
      'c4d3 e4f6 g8h8 c7h7',
      ['arabianMate', 'mate', 'mateIn2'],
    ],
    [
      '00Nte',
      'r4k2/8/2p3Bb/4p1n1/3q4/PQ6/2K2P2/1N4R1 w - - 3 30',
      'g1g5 d4f2 b1d2 h6g5 b3f3 f2f3',
      ['intermezzo'],
    ],
    [
      '00RPk',
      '8/2p5/5ppp/1PkP4/p4PPP/P1K5/8/8 b - - 0 39',
      'c5b5 c3d4 c7c5 d5c6 b5c6 d4c4',
      ['defensiveMove', 'enPassant', 'pawnEndgame'],
    ],
    [
      '00bJi',
      '7k/1p2R3/p3N3/3p4/2n5/2P5/PPK4r/8 w - - 3 36',
      'c2d3 h2d2',
      ['hookMate', 'mate', 'mateIn1'],
    ],
    [
      '00j1r',
      '8/2rkb3/1p6/6P1/5q2/3R4/Q1P1K3/8 b - - 4 37',
      'd7c6 a2d5',
      ['dovetailMate', 'mate', 'mateIn1'],
    ],
    [
      '011GG',
      '1R1Q4/5ppk/7p/4Pb2/1P6/2b5/3r3P/1K1R4 w - - 3 36',
      'b1c1 d2c2 c1b1 c2b2 b1a1 b2h2',
      ['discoveredAttack', 'doubleCheck', 'exposedKing', 'mate', 'mateIn3'],
    ],
    [
      '01RXs',
      '8/8/3r3p/p1P1k3/4pp2/PPKp4/6PR/8 b - - 0 40',
      'd3d2 h2h5 e5e6 h5h6',
      ['interference', 'rookEndgame'],
    ],
    [
      '01YDB',
      '8/6p1/4k1N1/5R1P/4n1PK/8/5P2/r7 w - - 11 60',
      'f2f3 a1h1',
      ['anastasiaMate', 'mate', 'mateIn1'],
    ],
    [
      '01rGp',
      '1r6/5pkp/6p1/8/8/8/1pR2PPP/rR4K1 w - - 2 39',
      'c2b2 a1b1 b2b1 b8b1',
      ['backRankMate', 'mate', 'mateIn2', 'rookEndgame', 'xRayAttack'],
    ],
    [
      '036MU',
      '2r4k/pB4p1/1b1B4/1b5p/5P2/6P1/P6P/7K w - - 0 27',
      'b7c8 b5c6',
      ['bishopEndgame', 'doubleBishopMate', 'mate', 'mateIn1'],
    ],
    [
      '0QCzc',
      '3bk3/5pK1/4P1bP/3p4/3P4/4B3/5R2/7r b - - 0 52',
      'd8e7 e6f7 g6f7 f2f7',
      ['advancedPawn', 'attackingF2F7'],
    ],
  ])('tags puzzle %s as lichess does', (_id, fen, moves, expected) => {
    expect(themes(fen, moves).sort()).toEqual([...expected].sort())
  })
})
