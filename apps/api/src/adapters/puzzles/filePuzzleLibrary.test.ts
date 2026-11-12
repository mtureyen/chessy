import { puzzleStart, unpackPuzzle, type PuzzleSetFile } from '@pawnia/analysis'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FilePuzzleLibrary } from './filePuzzleLibrary'
import { NoPuzzleSetError } from './puzzleLibraryService'

/** The checked-in sample: made by scripts/fetch-puzzles.ts like the full set, only smaller. */
const SAMPLE = fileURLToPath(new URL('../../../data/puzzle-sample.json', import.meta.url))
const sample = JSON.parse(readFileSync(SAMPLE, 'utf8')) as PuzzleSetFile

describe('the puzzle sample file', () => {
  it('holds real puzzles that can be played, of many themes and ratings', () => {
    expect(sample.version).toBe(1)
    expect(sample.source.url).toBe('https://database.lichess.org/lichess_db_puzzle.csv.zst')
    const puzzles = sample.puzzles.map(unpackPuzzle)
    expect(puzzles.length).toBeGreaterThanOrEqual(40)
    expect(new Set(puzzles.map((p) => p.id)).size).toBe(puzzles.length)
    for (const puzzle of puzzles) {
      expect(puzzleStart(puzzle), puzzle.id).toBeDefined()
      expect(puzzle.themes.length, puzzle.id).toBeGreaterThan(0)
    }
    const themes = new Set(puzzles.flatMap((p) => p.themes))
    for (const theme of ['fork', 'pin', 'skewer', 'hangingPiece', 'mateIn1', 'endgame']) {
      expect(themes, theme).toContain(theme)
    }
    const ratings = puzzles.map((p) => p.rating)
    expect(Math.min(...ratings)).toBeLessThan(800)
    expect(Math.max(...ratings)).toBeGreaterThan(2000)
  })
})

describe('FilePuzzleLibrary', () => {
  it('reads the set once and hands out its puzzles', async () => {
    const library = new FilePuzzleLibrary(SAMPLE, () => 0.999)
    const { source, puzzles, themes } = await library.library()
    expect(source).toEqual(sample.source)
    expect(puzzles).toBe(sample.puzzles.length)
    expect(themes.reduce((sum, t) => sum + t.puzzles, 0)).toBe(
      sample.puzzles.reduce((sum, p) => sum + p[4].split(' ').length, 0),
    )
    // Of the pins the last one near 1900 (the random source says so): 035YV, rated 1932.
    expect(await library.next({ themes: ['pin'], rating: 1900, exclude: [] })).toMatchObject({
      id: '035YV',
      theme: 'pin',
      color: 'white',
      solution: ['e1c1', 'c8d7', 'e3c5'],
    })
    expect(await library.puzzle('035YV')).toMatchObject({ id: '035YV', rating: 1932 })
    expect((await library.puzzle('035YV'))?.theme).toBeUndefined()
    expect(await library.puzzle('nope')).toBeUndefined()
  })

  it('says how to get the set when there is none, and finds it once it is there', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'pawnia-puzzles-')), 'puzzles.json')
    const library = new FilePuzzleLibrary(path)
    await expect(library.library()).rejects.toThrow(NoPuzzleSetError)
    await expect(library.next({ themes: [], rating: 1500, exclude: [] })).rejects.toThrow(
      /no such file.*bun run --cwd apps\/api puzzles:fetch/,
    )

    writeFileSync(path, '{"version":1,"puzz')
    await expect(library.library()).rejects.toThrow(/not readable as JSON/)
    writeFileSync(path, JSON.stringify({ version: 2, puzzles: [] }))
    await expect(library.library()).rejects.toThrow(/not a puzzle set of this version/)

    writeFileSync(path, readFileSync(SAMPLE))
    expect((await library.library()).puzzles).toBe(sample.puzzles.length)
  })
})
