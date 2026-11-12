import { describe, expect, it } from 'vitest'
import {
  capPuzzles,
  formatPuzzleSet,
  isGoodPuzzle,
  packPuzzle,
  parsePuzzleRow,
  pickPuzzle,
  PUZZLE_COLUMNS,
  puzzleStart,
  puzzleThemeKind,
  puzzleThemes,
  unpackPuzzle,
  type Puzzle,
  type PuzzleRow,
  type PuzzleSetFile,
} from './puzzleSet'

/** The database's first lines, as lichess publishes them. */
const HEADER =
  'PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate'
const ROW_0000D =
  '0000D,5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27,d3d6 f8d8 d6d8 f6d8,1433,75,96,37700,advantage endgame short,https://lichess.org/game/F8M8OS71#53,,'
const ROW_0000H =
  '0000H,r4rk1/pp3ppp/8/2bqp2b/3N4/P2Bn2P/1PPN1P2/R1BQ1RK1 w - - 1 15,d1h5 d5g2,1032,78,100,92,mate mateIn1 middlegame oneMove,https://lichess.org/game/EwHRkfas#29,French_Defense French_Defense_Tarrasch_Variation,'

const puzzle = (id: string, rating: number, ...themes: string[]): Puzzle => ({
  id,
  fen: '',
  moves: [],
  rating,
  themes,
})
const ids = (puzzles: readonly { id: string }[]) => puzzles.map((p) => p.id)

describe('parsePuzzleRow', () => {
  it('reads a row of the database', () => {
    expect(parsePuzzleRow(ROW_0000D)).toEqual({
      id: '0000D',
      fen: '5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27',
      moves: ['d3d6', 'f8d8', 'd6d8', 'f6d8'],
      rating: 1433,
      ratingDeviation: 75,
      popularity: 96,
      plays: 37700,
      themes: ['advantage', 'endgame', 'short'],
    })
    expect(parsePuzzleRow(`${ROW_0000H}\r`)?.themes).toEqual([
      'mate',
      'mateIn1',
      'middlegame',
      'oneMove',
    ])
  })

  it('reads a disliked puzzle and one without themes', () => {
    const row = parsePuzzleRow('abcde,8/8/8/8/8/8/8/8 w - - 0 1,a1a2 b7b8q,900,300,-40,3,,,,')
    expect(row).toMatchObject({ popularity: -40, moves: ['a1a2', 'b7b8q'], themes: [] })
  })

  it('takes nothing else for a puzzle: the header, an empty line, a row cut off', () => {
    expect(HEADER.startsWith(PUZZLE_COLUMNS)).toBe(true)
    expect(parsePuzzleRow(HEADER)).toBeUndefined()
    expect(parsePuzzleRow('')).toBeUndefined()
    // Cut in the position, in a move, before the themes.
    expect(parsePuzzleRow('0000D,5rk1/1p3ppp/pq3b')).toBeUndefined()
    expect(parsePuzzleRow(ROW_0000D.slice(0, ROW_0000D.indexOf('d6d8') + 2))).toBeUndefined()
    expect(parsePuzzleRow(ROW_0000D.slice(0, ROW_0000D.indexOf(',advantage')))).toBeUndefined()
    // A puzzle needs the opponent's move and one to find.
    expect(parsePuzzleRow(ROW_0000H.replace('d1h5 d5g2', 'd1h5'))).toBeUndefined()
    expect(parsePuzzleRow(ROW_0000D.replace('1433', 'high'))).toBeUndefined()
  })
})

describe('isGoodPuzzle', () => {
  const row = (changes: Partial<PuzzleRow>): PuzzleRow => ({
    ...parsePuzzleRow(ROW_0000D)!,
    ...changes,
  })

  it('wants a liked puzzle whose rating has settled, below 2200', () => {
    expect(isGoodPuzzle(row({}))).toBe(true)
    expect(
      isGoodPuzzle(row({ popularity: 85, plays: 500, ratingDeviation: 90, rating: 2199 })),
    ).toBe(true)
    expect(isGoodPuzzle(row({ popularity: 84 }))).toBe(false)
    expect(isGoodPuzzle(row({ plays: 499 }))).toBe(false)
    expect(isGoodPuzzle(row({ ratingDeviation: 91 }))).toBe(false)
    expect(isGoodPuzzle(row({ rating: 2200 }))).toBe(false)
    // The first rows of the database: 0000H was played 92 times.
    expect(isGoodPuzzle(parsePuzzleRow(ROW_0000H)!)).toBe(false)
  })

  it('takes other limits', () => {
    const loose = { minPopularity: 0, minPlays: 50, maxRatingDeviation: 100, ratingBelow: 3000 }
    expect(isGoodPuzzle(parsePuzzleRow(ROW_0000H)!, loose)).toBe(true)
    expect(isGoodPuzzle(row({ rating: 3000 }), loose)).toBe(false)
  })
})

describe('capPuzzles', () => {
  const cap = { perThemeBand: 2, bandWidth: 100 }

  it('keeps the first of a theme in a rating band, in their order', () => {
    const kept = capPuzzles(
      [
        puzzle('a', 1510, 'fork'),
        puzzle('b', 1590, 'fork'),
        puzzle('c', 1550, 'fork'), // the band 1500–1599 is full
        puzzle('d', 1600, 'fork'), // the next band
        puzzle('e', 1499, 'fork'), // the one before
      ],
      cap,
    )
    expect(ids(kept)).toEqual(['a', 'b', 'd', 'e'])
  })

  it('keeps a puzzle while any of its themes has room, and counts it for all of them', () => {
    const kept = capPuzzles(
      [
        puzzle('a', 1500, 'fork', 'short'),
        puzzle('b', 1500, 'pin', 'short'),
        puzzle('c', 1500, 'short'), // short is full
        puzzle('d', 1500, 'skewer', 'short'), // kept for the skewer: short goes over its cap
        puzzle('e', 1500, 'fork'),
        puzzle('f', 1500, 'fork'), // a, e
        puzzle('g', 1500), // no theme to keep it for
      ],
      cap,
    )
    expect(ids(kept)).toEqual(['a', 'b', 'd', 'e'])
  })
})

describe('puzzle themes', () => {
  it('tells what a theme says about a puzzle', () => {
    expect(puzzleThemeKind('fork')).toBe('motif')
    expect(puzzleThemeKind('hangingPiece')).toBe('motif')
    expect(puzzleThemeKind('mate')).toBe('mate')
    expect(puzzleThemeKind('mateIn3')).toBe('mate')
    expect(puzzleThemeKind('backRankMate')).toBe('mate')
    expect(puzzleThemeKind('endgame')).toBe('phase')
    expect(puzzleThemeKind('rookEndgame')).toBe('phase')
    expect(puzzleThemeKind('veryLong')).toBe('length')
    expect(puzzleThemeKind('crushing')).toBe('goal')
    expect(puzzleThemeKind('superGM')).toBe('origin')
    // One lichess adds later counts as a motif until it is sorted in.
    expect(puzzleThemeKind('somethingNew')).toBe('motif')
  })

  it('counts the puzzles of every theme, the most first', () => {
    expect(
      puzzleThemes([
        puzzle('a', 1500, 'pin', 'short'),
        puzzle('b', 1500, 'fork', 'short'),
        puzzle('c', 1500, 'fork', 'mateIn2'),
      ]),
    ).toEqual([
      { theme: 'fork', kind: 'motif', puzzles: 2 },
      { theme: 'short', kind: 'length', puzzles: 2 },
      { theme: 'mateIn2', kind: 'mate', puzzles: 1 },
      { theme: 'pin', kind: 'motif', puzzles: 1 },
    ])
  })
})

describe('pickPuzzle', () => {
  const SET = [
    puzzle('fork-1200', 1200, 'fork', 'short'),
    puzzle('fork-1480', 1480, 'fork', 'short'),
    puzzle('fork-1530', 1530, 'fork', 'long'),
    puzzle('fork-1580', 1580, 'fork', 'short'),
    puzzle('pin-1500', 1500, 'pin', 'short'),
    puzzle('pin-2100', 2100, 'pin', 'long'),
    puzzle('skewer-900', 900, 'skewer', 'short'),
  ]
  /** A random source that gives these numbers in turn. */
  const sequence = (...numbers: number[]) => {
    let next = 0
    return () => numbers[next++ % numbers.length]!
  }

  it('picks by chance among the puzzles of the theme closest to the rating', () => {
    // Within 50 of 1500: fork-1480 and fork-1530.
    const pick = (random: number) =>
      pickPuzzle(SET, { themes: ['fork'], rating: 1500, random: () => random })
    expect(pick(0)).toEqual({ puzzle: SET[1], theme: 'fork' })
    expect(pick(0.49)?.puzzle.id).toBe('fork-1480')
    expect(pick(0.5)?.puzzle.id).toBe('fork-1530')
    expect(pick(0.999)?.puzzle.id).toBe('fork-1530')
  })

  it('looks further from the rating when nothing is near', () => {
    const pick = (rating: number, exclude: string[] = []) =>
      pickPuzzle(SET, { themes: ['fork'], rating, exclude: new Set(exclude), random: () => 0 })
        ?.puzzle.id
    expect(pick(1650)).toBe('fork-1580') // within 100
    expect(pick(1350)).toBe('fork-1200') // within 200: 1200, 1480, 1530
    expect(pick(1500, ['fork-1480', 'fork-1530'])).toBe('fork-1580') // within 100
    expect(pick(1500, ['fork-1480', 'fork-1530', 'fork-1580'])).toBe('fork-1200') // within 400
    // Past the widest distance: the closest there is.
    expect(pick(2150)).toBe('fork-1580')
    expect(pick(400)).toBe('fork-1200')
  })

  it('draws one of several themes first, each as likely as the others', () => {
    const themes = ['fork', 'pin', 'skewer']
    const pick = (theme: number) =>
      pickPuzzle(SET, { themes, rating: 1500, random: sequence(theme, 0) })
    expect(pick(0)).toMatchObject({ theme: 'fork', puzzle: { id: 'fork-1480' } })
    expect(pick(0.34)).toMatchObject({ theme: 'pin', puzzle: { id: 'pin-1500' } })
    // The only skewer is far off, and still its turn.
    expect(pick(0.67)).toMatchObject({ theme: 'skewer', puzzle: { id: 'skewer-900' } })
    // A theme named twice has no better chance.
    expect(
      pickPuzzle(SET, { themes: ['fork', 'fork', 'pin'], rating: 1500, random: sequence(0.5, 0) }),
    ).toMatchObject({ theme: 'pin' })
  })

  it('leaves out a theme with nothing left, and says when nothing is left at all', () => {
    const exclude = new Set(['pin-1500', 'pin-2100'])
    expect(
      pickPuzzle(SET, { themes: ['pin', 'skewer'], rating: 1500, exclude, random: () => 0 }),
    ).toMatchObject({ theme: 'skewer' })
    expect(pickPuzzle(SET, { themes: ['pin'], rating: 1500, exclude })).toBeUndefined()
    expect(pickPuzzle(SET, { themes: ['zugzwang'], rating: 1500 })).toBeUndefined()
    expect(pickPuzzle(SET, { rating: 1500, exclude: new Set(ids(SET)) })).toBeUndefined()
    expect(pickPuzzle([], { rating: 1500 })).toBeUndefined()
  })

  it('picks from all puzzles when no theme is wanted', () => {
    // Within 50 of 1500: fork-1480, fork-1530, pin-1500.
    const pick = (random: number) => pickPuzzle(SET, { rating: 1500, random: () => random })
    expect(pick(0.7)).toEqual({ puzzle: SET[4] })
    expect(pick(0)?.puzzle.id).toBe('fork-1480')
    expect(pickPuzzle(SET, { themes: [], rating: 880, random: () => 0 })?.puzzle.id).toBe(
      'skewer-900',
    )
  })

  it('never hands out an excluded puzzle, whatever the chance', () => {
    const exclude = new Set(['fork-1480', 'pin-1500'])
    for (let i = 0; i < 200; i++) {
      const picked = pickPuzzle(SET, { themes: ['fork', 'pin'], rating: 1500, exclude })
      expect(exclude.has(picked!.puzzle.id)).toBe(false)
    }
  })
})

describe('puzzleStart', () => {
  it('plays the opponent’s move: the solver starts from the position after it', () => {
    expect(puzzleStart(parsePuzzleRow(ROW_0000D)!)).toEqual({
      fen: '5rk1/1p3ppp/pq1Q1b2/8/8/1P3N2/P4PPP/3R2K1 b - - 3 27',
      opponentMove: 'd3d6',
      color: 'black',
      solution: ['f8d8', 'd6d8', 'f6d8'],
    })
  })

  it('plays castling and promotions as lichess writes them', () => {
    expect(
      puzzleStart({
        fen: 'r1bk3r/1p3ppp/p7/2b5/P7/4Bp2/1P3PPP/R3KB1R b KQ - 1 14',
        moves: ['h8e8', 'e1c1', 'c8d7', 'e3c5'],
      }),
    ).toMatchObject({ color: 'white', solution: ['e1c1', 'c8d7', 'e3c5'] })
    expect(
      puzzleStart({
        fen: '8/8/5R1p/8/3pb1P1/kpKp4/8/8 w - - 0 54',
        moves: ['c3d4', 'd3d2', 'd4c3', 'd2d1n'],
      }),
    ).toMatchObject({ fen: '8/8/5R1p/8/3Kb1P1/kp1p4/8/8 b - - 0 54', color: 'black' })
  })

  it('is undefined for a puzzle that can’t be played as written', () => {
    const { fen, moves } = parsePuzzleRow(ROW_0000D)!
    expect(puzzleStart({ fen, moves: ['d3e5', ...moves.slice(1)] })).toBeUndefined() // first move
    expect(puzzleStart({ fen, moves: [...moves.slice(0, 3), 'f6d7'] })).toBeUndefined() // last
    expect(puzzleStart({ fen, moves: ['d3d6'] })).toBeUndefined() // nothing to find
    expect(puzzleStart({ fen: 'not a position', moves })).toBeUndefined()
  })
})

describe('the puzzle set’s file', () => {
  const puzzles = [parsePuzzleRow(ROW_0000D)!, parsePuzzleRow(ROW_0000H)!]
  const file: PuzzleSetFile = {
    version: 1,
    source: {
      url: 'https://database.lichess.org/lichess_db_puzzle.csv.zst',
      license: 'CC0-1.0',
      lastModified: '2026-11-01T07:57:40.000Z',
      fetchedAt: '2026-11-12T20:00:00.000Z',
      bytes: 1024,
      read: 2,
      good: 2,
      filter: { minPopularity: 85, minPlays: 500, maxRatingDeviation: 90, ratingBelow: 2200 },
      cap: { perThemeBand: 200, bandWidth: 100 },
    },
    puzzles: puzzles.map(packPuzzle),
  }

  it('holds a puzzle as lichess has it, without what only the choice needed', () => {
    expect(file.puzzles[0]).toEqual([
      '0000D',
      '5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27',
      'd3d6 f8d8 d6d8 f6d8',
      1433,
      'advantage endgame short',
    ])
    const { ratingDeviation: _d, popularity: _p, plays: _n, ...kept } = puzzles[0]!
    expect(unpackPuzzle(file.puzzles[0]!)).toEqual(kept)
    expect(unpackPuzzle(['x', 'fen', 'a1a2 a7a6', 1000, '']).themes).toEqual([])
  })

  it('is written as JSON with a puzzle per line', () => {
    const text = formatPuzzleSet(file)
    expect(JSON.parse(text)).toEqual(file)
    const lines = text.split('\n')
    expect(lines).toHaveLength(5) // the head, two puzzles, the end, and the last line break
    expect(lines[1]).toBe(`${JSON.stringify(file.puzzles[0])},`)
    expect(lines[2]).toBe(JSON.stringify(file.puzzles[1]))
    expect(JSON.parse(formatPuzzleSet({ ...file, puzzles: [] }))).toEqual({ ...file, puzzles: [] })
  })
})
