/** Which side studies an opening: White's own systems, or Black's answers to 1.e4 / 1.d4. */
export type LibraryGroup = 'white' | 'vs-e4' | 'vs-d4'

/** A word on how an opening plays, set by hand (the numbers can't tell it). */
export type OpeningStyle = 'classical' | 'solid' | 'sharp' | 'gambit' | 'system'

/** An opening of the library, as chosen by hand. */
export interface LibraryEntry {
  /** URL-safe and stable, e.g. "caro-kann". */
  id: string
  name: string
  /** The side the opening is studied for. */
  side: 'white' | 'black'
  group: LibraryGroup
  /** The position that defines it, in SAN from the start: stats and tags are read here. */
  main: string
  /**
   * Which named lines of the opening book belong to it: a name that starts with one of these
   * (or contains one, for systems reached by many move orders like the London).
   */
  names: { startsWith?: string[]; contains?: string[] }
  style: OpeningStyle[]
}

/** The library's start set: about thirty openings for White and Black (user, 2026-11-11). */
export const START_SET: readonly LibraryEntry[] = [
  // White
  {
    id: 'italian',
    name: 'Italian Game',
    side: 'white',
    group: 'white',
    main: 'e4 e5 Nf3 Nc6 Bc4',
    names: { startsWith: ['Italian Game'] },
    style: ['classical'],
  },
  {
    id: 'ruy-lopez',
    name: 'Ruy Lopez',
    side: 'white',
    group: 'white',
    main: 'e4 e5 Nf3 Nc6 Bb5',
    names: { startsWith: ['Ruy Lopez'] },
    style: ['classical', 'solid'],
  },
  {
    id: 'scotch',
    name: 'Scotch Game',
    side: 'white',
    group: 'white',
    main: 'e4 e5 Nf3 Nc6 d4',
    names: { startsWith: ['Scotch Game'] },
    style: ['classical', 'sharp'],
  },
  {
    id: 'vienna',
    name: 'Vienna Game',
    side: 'white',
    group: 'white',
    main: 'e4 e5 Nc3',
    names: { startsWith: ['Vienna Game'] },
    style: ['classical', 'sharp'],
  },
  {
    id: 'kings-gambit',
    name: "King's Gambit",
    side: 'white',
    group: 'white',
    main: 'e4 e5 f4',
    names: { startsWith: ["King's Gambit"] },
    style: ['gambit', 'sharp'],
  },
  {
    id: 'danish',
    name: 'Danish Gambit',
    side: 'white',
    group: 'white',
    main: 'e4 e5 d4 exd4 c3',
    names: { startsWith: ['Danish Gambit'] },
    style: ['gambit', 'sharp'],
  },
  {
    id: 'bishops-opening',
    name: "Bishop's Opening",
    side: 'white',
    group: 'white',
    main: 'e4 e5 Bc4',
    names: { startsWith: ["Bishop's Opening"] },
    style: ['classical'],
  },
  {
    id: 'london',
    name: 'London System',
    side: 'white',
    group: 'white',
    main: 'd4 d5 Bf4',
    names: { contains: ['London System'] },
    style: ['system', 'solid'],
  },
  {
    id: 'queens-gambit',
    name: "Queen's Gambit",
    side: 'white',
    group: 'white',
    main: 'd4 d5 c4',
    names: { startsWith: ["Queen's Gambit"] },
    style: ['classical', 'solid'],
  },
  {
    id: 'english',
    name: 'English Opening',
    side: 'white',
    group: 'white',
    main: 'c4',
    names: { startsWith: ['English Opening'] },
    style: ['solid'],
  },
  {
    id: 'smith-morra',
    name: 'Smith-Morra Gambit',
    side: 'white',
    group: 'white',
    main: 'e4 c5 d4 cxd4 c3',
    names: { startsWith: ['Sicilian Defense: Smith-Morra Gambit'] },
    style: ['gambit', 'sharp'],
  },
  // Black against 1.e4
  {
    id: 'sicilian',
    name: 'Sicilian Defense',
    side: 'black',
    group: 'vs-e4',
    main: 'e4 c5',
    names: { startsWith: ['Sicilian Defense'] },
    style: ['sharp'],
  },
  {
    id: 'french',
    name: 'French Defense',
    side: 'black',
    group: 'vs-e4',
    main: 'e4 e6',
    names: { startsWith: ['French Defense'] },
    style: ['solid'],
  },
  {
    id: 'caro-kann',
    name: 'Caro-Kann Defense',
    side: 'black',
    group: 'vs-e4',
    main: 'e4 c6',
    names: { startsWith: ['Caro-Kann Defense'] },
    style: ['solid'],
  },
  {
    id: 'scandinavian',
    name: 'Scandinavian Defense',
    side: 'black',
    group: 'vs-e4',
    main: 'e4 d5',
    names: { startsWith: ['Scandinavian Defense'] },
    style: ['solid'],
  },
  {
    id: 'pirc',
    name: 'Pirc Defense',
    side: 'black',
    group: 'vs-e4',
    main: 'e4 d6 d4 Nf6',
    names: { startsWith: ['Pirc Defense'] },
    style: ['sharp'],
  },
  {
    id: 'petrov',
    name: "Petrov's Defense",
    side: 'black',
    group: 'vs-e4',
    main: 'e4 e5 Nf3 Nf6',
    names: { startsWith: ["Petrov's Defense"] },
    style: ['solid'],
  },
  {
    id: 'philidor',
    name: 'Philidor Defense',
    side: 'black',
    group: 'vs-e4',
    main: 'e4 e5 Nf3 d6',
    names: { startsWith: ['Philidor Defense'] },
    style: ['solid'],
  },
  {
    id: 'two-knights',
    name: 'Two Knights Defense',
    side: 'black',
    group: 'vs-e4',
    main: 'e4 e5 Nf3 Nc6 Bc4 Nf6',
    names: { startsWith: ['Italian Game: Two Knights Defense'] },
    style: ['classical', 'sharp'],
  },
  {
    id: 'stafford',
    name: 'Stafford Gambit',
    side: 'black',
    group: 'vs-e4',
    main: 'e4 e5 Nf3 Nf6 Nxe5 Nc6',
    names: { startsWith: ["Petrov's Defense: Stafford Gambit"] },
    style: ['gambit', 'sharp'],
  },
  // Black against 1.d4
  {
    id: 'qgd',
    name: "Queen's Gambit Declined",
    side: 'black',
    group: 'vs-d4',
    main: 'd4 d5 c4 e6',
    names: { startsWith: ["Queen's Gambit Declined"] },
    style: ['classical', 'solid'],
  },
  {
    id: 'slav',
    name: 'Slav Defense',
    side: 'black',
    group: 'vs-d4',
    main: 'd4 d5 c4 c6',
    names: { startsWith: ['Slav Defense'] },
    style: ['solid'],
  },
  {
    id: 'kings-indian',
    name: "King's Indian Defense",
    side: 'black',
    group: 'vs-d4',
    main: 'd4 Nf6 c4 g6 Nc3 Bg7',
    names: { startsWith: ["King's Indian Defense"] },
    style: ['sharp'],
  },
  {
    id: 'nimzo-indian',
    name: 'Nimzo-Indian Defense',
    side: 'black',
    group: 'vs-d4',
    main: 'd4 Nf6 c4 e6 Nc3 Bb4',
    names: { startsWith: ['Nimzo-Indian Defense'] },
    style: ['classical', 'solid'],
  },
  {
    id: 'dutch',
    name: 'Dutch Defense',
    side: 'black',
    group: 'vs-d4',
    main: 'd4 f5',
    names: { startsWith: ['Dutch Defense'] },
    style: ['sharp'],
  },
  {
    id: 'englund',
    name: 'Englund Gambit',
    side: 'black',
    group: 'vs-d4',
    main: 'd4 e5',
    names: { startsWith: ['Englund Gambit'] },
    style: ['gambit', 'sharp'],
  },
  {
    id: 'albin',
    name: 'Albin Countergambit',
    side: 'black',
    group: 'vs-d4',
    main: 'd4 d5 c4 e5',
    names: { startsWith: ["Queen's Gambit Declined: Albin Countergambit"] },
    style: ['gambit', 'sharp'],
  },
]
