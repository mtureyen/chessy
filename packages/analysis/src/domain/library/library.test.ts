import { createGame } from '@pawnia/chess'
import { describe, expect, it } from 'vitest'
import { bookKey } from '../review/book'
import {
  bandOf,
  bandTotal,
  entryLines,
  LibraryCounter,
  libraryKeys,
  lineKeys,
  openingNumbers,
  openingTags,
  sanMoves,
  scoreFor,
  trapCandidates,
  trapInOpening,
  type BookLine,
  type PositionCounts,
} from './library'
import { START_SET, type LibraryEntry } from './startSet'

const keyAfter = (moves: string) => lineKeys(moves ? moves.split(' ') : [])!.at(-1)!

const BOOK: BookLine[] = [
  { eco: 'B10', name: 'Caro-Kann Defense', moves: 'e4 c6' },
  { eco: 'B12', name: 'Caro-Kann Defense: Advance Variation', moves: 'e4 c6 d4 d5 e5' },
  { eco: 'B10', name: 'Caro-Kann Defense, Accelerated', moves: 'e4 c6 Nf3' },
  { eco: 'B00', name: 'Caro-Kann Defenseless', moves: 'e4 c6 Qh5' }, // not the same family
  { eco: 'D02', name: "Queen's Pawn Game: London System", moves: 'd4 d5 Nf3 Nf6 Bf4' },
  { eco: 'A46', name: 'Indian Defense: London System', moves: 'd4 Nf6 Nf3 e6 Bf4' },
  { eco: 'D06', name: "Queen's Gambit", moves: 'd4 d5 c4' },
  { eco: 'D30', name: "Queen's Gambit Declined", moves: 'd4 d5 c4 e6' },
  { eco: 'D31', name: "Queen's Gambit Declined: Baltic Transposition", moves: 'd4 e6 c4 d5' },
  { eco: 'D08', name: "Queen's Gambit Declined: Albin Countergambit", moves: 'd4 d5 c4 e5' },
]

const entry = (id: string): LibraryEntry => START_SET.find((e) => e.id === id)!

describe('library lines', () => {
  it('reads a book row’s moves', () => {
    expect(sanMoves('1. e4 c6 2. d4 d5 3. e5')).toEqual(['e4', 'c6', 'd4', 'd5', 'e5'])
  })

  it('takes the named lines through the main position, in any move order', () => {
    expect(entryLines(entry('caro-kann'), BOOK).map((l) => l.name)).toEqual([
      'Caro-Kann Defense',
      'Caro-Kann Defense, Accelerated',
      'Caro-Kann Defense: Advance Variation',
    ])
    // The Baltic transposition reaches 1.d4 d5 2.c4 e6 by another order; the Albin doesn't.
    expect(entryLines(entry('qgd'), BOOK).map((l) => l.moves)).toEqual([
      'd4 d5 c4 e6',
      'd4 e6 c4 d5',
    ])
  })

  it('takes names that go on after the family with a space, like "… Gambit Accepted"', () => {
    const stafford = [
      { eco: 'C42', name: "Petrov's Defense: Stafford Gambit", moves: 'e4 e5 Nf3 Nf6 Nxe5 Nc6' },
      {
        eco: 'C42',
        name: "Petrov's Defense: Stafford Gambit Accepted",
        moves: 'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6',
      },
    ]
    expect(entryLines(entry('stafford'), stafford)).toHaveLength(2)
  })

  it('takes a system like the London from every family it appears in', () => {
    expect(entryLines(entry('london'), BOOK).map((l) => l.name)).toEqual([
      'Indian Defense: London System',
      "Queen's Pawn Game: London System",
    ])
  })

  it('every opening of the start set has a legal main line and its own id', () => {
    for (const e of START_SET) expect(lineKeys(e.main.split(' ')), e.id).toBeDefined()
    expect(new Set(START_SET.map((e) => e.id)).size).toBe(START_SET.length)
    expect(START_SET.filter((e) => e.side === 'white')).toHaveLength(11)
  })
})

describe('counting games', () => {
  const keys = libraryKeys([{ main: 'e4 c6', lines: [BOOK[1]!] }])

  it('counts the moves from library positions per band, with results', () => {
    const counter = new LibraryCounter(keys)
    counter.add(sanMoves('1. e4 c6 2. d4 d5 3. e5 Bf5'), '1-0', 1000, 1100)
    counter.add(sanMoves('1. e4 c6 2. Nc3 d5'), '0-1', 1500, 1500)
    counter.add(sanMoves('1. d4 d5'), '1/2-1/2', 2100, 2300) // no library position after 1.d4
    counter.add(sanMoves('1. e4 c6'), '*', 1000, 1000) // unfinished: not counted
    expect(counter.games).toEqual({ 'under-1200': 1, '1200-1599': 1, '1600-1999': 0, '2000+': 1 })
    const afterC6 = counter.positions.get(keyAfter('e4 c6'))!
    expect(Object.keys(afterC6).sort()).toEqual(['Nc3', 'd4'])
    expect(bandTotal(afterC6, 'under-1200')).toEqual([1, 0, 0])
    expect(bandTotal(afterC6, '1200-1599')).toEqual([0, 0, 1])
    // 1.d4 is counted from the start position (a library position), then nothing more.
    expect(bandTotal(counter.positions.get(keyAfter('')), '2000+')).toEqual([0, 1, 0])
    // Past the advance line's end nothing is counted.
    expect(counter.positions.get(keyAfter('e4 c6 d4 d5 e5 Bf5'))).toBeUndefined()
  })

  it('sorts games into bands by the mean rating', () => {
    expect(bandOf(1150, 1300)).toBe('1200-1599')
    expect(bandOf(1999, 2001)).toBe('2000+')
    expect(bandOf(800, 900)).toBe('under-1200')
  })
})

describe('numbers and tags', () => {
  const games = { 'under-1200': 1000, '1200-1599': 1000, '1600-1999': 1000, '2000+': 1000 }
  /** One move with these white-draw-black counts per band. */
  const position = (...bands: [number, number, number][]): PositionCounts => ({
    x: bands.flat(),
  })

  it('scores the opening for its side and counts its share per band', () => {
    const main = position([60, 0, 40], [55, 10, 35], [50, 0, 50], [5, 0, 5])
    expect(scoreFor([60, 0, 40], 'black')).toBe(40)
    expect(openingNumbers('white', main, games)).toEqual({
      score: { 'under-1200': 60, '1200-1599': 60, '1600-1999': 50, '2000+': 50 },
      share: { 'under-1200': 100, '1200-1599': 100, '1600-1999': 100, '2000+': 10 },
    })
  })

  it('tags what works low and what strong players choose', () => {
    expect(
      openingTags(position([60, 0, 40], [55, 10, 35], [50, 0, 50], [5, 0, 5]), 'white', games),
    ).toEqual({
      lowElo: true,
      strong: false,
    })
    expect(
      openingTags(position([2, 0, 2], [2, 0, 2], [3, 0, 3], [30, 20, 30]), 'black', games),
    ).toEqual({
      lowElo: false,
      strong: true,
    })
  })
})

describe('traps', () => {
  /** Games under 1200 with these moves and result. */
  const feed = (counter: LibraryCounter, moves: string, result: string, times: number) => {
    for (let i = 0; i < times; i++) counter.add(moves.split(' '), result, 1000, 1000)
  }

  it('finds where the usual move under 1600 loses for the side that makes it', () => {
    // The Stafford: after 1.e4 e5 2.Nf3 Nf6 3.Nxe5 Nc6, say most low-rated White players take
    // 4.Nxc6 and it scores badly for them.
    const counter = new LibraryCounter(libraryKeys([{ main: 'e4 e5 Nf3 Nf6 Nxe5 Nc6', lines: [] }]))
    feed(counter, 'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6', '0-1', 200)
    feed(counter, 'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6', '1-0', 100)
    feed(counter, 'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nf3 Qe7', '1-0', 60)
    const found = trapCandidates(counter.positions)
    expect(found).toEqual([
      {
        moves: 'e4 e5 Nf3 Nf6 Nxe5 Nc6'.split(' '),
        fen: expect.stringContaining(' w KQkq '),
        trapper: 'black',
        bait: 'Nxc6',
        baitShare: 83,
        trapperScore: 67,
        games: 300,
      },
    ])
    expect(bookKey(createGame(found[0]!.fen).fen())).toBe(keyAfter('e4 e5 Nf3 Nf6 Nxe5 Nc6'))
  })

  it('counts a little past the library’s lines, and prunes what is rare there', () => {
    const counter = new LibraryCounter(libraryKeys([{ main: 'e4 e5', lines: [] }]), { beyond: 2 })
    feed(counter, 'e4 e5 Nf3 Nc6 Bb5 a6', '1-0', 3)
    feed(counter, 'e4 e5 Qh5 Nc6 Bc4 Nf6', '1-0', 1)
    // After 1.e4 e5 (the last library position): 2.Nf3 Nc6 still counted, 3.Bb5 not.
    expect(counter.positions.get(keyAfter('e4 e5 Nf3'))).toBeDefined()
    expect(counter.positions.get(keyAfter('e4 e5 Nf3 Nc6'))).toBeDefined()
    expect(counter.positions.get(keyAfter('e4 e5 Nf3 Nc6 Bb5'))).toBeUndefined()
    counter.prune(2)
    expect(counter.positions.get(keyAfter('e4 e5 Qh5'))).toBeUndefined()
    expect(counter.positions.get(keyAfter('e4 e5 Nf3'))).toBeDefined()
    expect(counter.positions.get(keyAfter('e4'))).toBeDefined() // the library's own stay
  })
})

describe('which opening a trap belongs to', () => {
  const italian = {
    main: 'e4 e5 Nf3 Nc6 Bc4',
    lines: [
      {
        eco: 'C57',
        name: 'Italian Game: Two Knights Defense, Fried Liver Attack',
        moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7',
      },
    ],
  }

  it('takes the opening’s own move order for a trap found by another', () => {
    // Reached by the Bishop's Opening order, but it is the Italian's Fried Liver.
    expect(
      trapInOpening('e4 e5 Bc4 Nf6 Nf3 Nc6 Ng5 d5 exd5 Nxd5 Nxf7'.split(' '), italian),
    ).toEqual('e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7'.split(' '))
  })

  it('keeps a trap past the named lines that goes through the main position', () => {
    const deeper = 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+'.split(' ')
    expect(trapInOpening(deeper, italian)).toEqual(deeper)
  })

  it('leaves out traps before the main position or elsewhere', () => {
    expect(trapInOpening(['e4', 'e5'], italian)).toBeUndefined()
    expect(trapInOpening('d4 e5 dxe5'.split(' '), italian)).toBeUndefined()
  })
})
