/**
 * Short, balanced opening lines for engine matches. Each pairing plays every line once with each
 * colour, so games differ and neither side profits from a lucky opening.
 */
export const MATCH_OPENINGS: readonly { name: string; moves: readonly string[] }[] = [
  { name: 'Ruy Lopez', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'] },
  { name: 'Italian Game', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5'] },
  { name: 'Petrov Defence', moves: ['e2e4', 'e7e5', 'g1f3', 'g8f6'] },
  {
    name: 'Open Sicilian',
    moves: ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6'],
  },
  { name: 'Closed Sicilian', moves: ['e2e4', 'c7c5', 'b1c3', 'b8c6'] },
  { name: 'French Defence', moves: ['e2e4', 'e7e6', 'd2d4', 'd7d5'] },
  { name: 'Caro-Kann Defence', moves: ['e2e4', 'c7c6', 'd2d4', 'd7d5'] },
  { name: 'Scandinavian Defence', moves: ['e2e4', 'd7d5', 'e4d5', 'd8d5'] },
  { name: 'Alekhine Defence', moves: ['e2e4', 'g8f6', 'e4e5', 'f6d5'] },
  { name: 'Pirc Defence', moves: ['e2e4', 'd7d6', 'd2d4', 'g8f6', 'b1c3', 'g7g6'] },
  { name: "Queen's Gambit Declined", moves: ['d2d4', 'd7d5', 'c2c4', 'e7e6'] },
  { name: 'Slav Defence', moves: ['d2d4', 'd7d5', 'c2c4', 'c7c6'] },
  { name: "Queen's Gambit Accepted", moves: ['d2d4', 'd7d5', 'c2c4', 'd5c4'] },
  { name: "King's Indian Defence", moves: ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7'] },
  { name: 'Nimzo-Indian Defence', moves: ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3', 'f8b4'] },
  { name: "Queen's Indian Defence", moves: ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'g1f3', 'b7b6'] },
  { name: 'Dutch Defence', moves: ['d2d4', 'f7f5'] },
  { name: 'London System', moves: ['d2d4', 'd7d5', 'c1f4'] },
  { name: 'English Opening', moves: ['c2c4', 'e7e5'] },
  { name: 'Réti Opening', moves: ['g1f3', 'd7d5', 'g2g3'] },
]
