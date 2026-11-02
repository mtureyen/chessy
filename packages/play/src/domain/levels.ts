/**
 * How a bot level plays. The engine ranks `candidates` moves with `nodes` of search; the bot then
 * picks one at random, the more likely the less winning chance it gives away (see `selectMove`).
 */
export interface BotLevel {
  level: number
  name: string
  /** Search budget per move. */
  nodes: number
  /** How many moves the engine ranks (UCI MultiPV). */
  candidates: number
  /**
   * Win-% given away at which a move becomes e (≈2.7) times less likely than the best one.
   * Higher plays looser.
   */
  temperature: number
  /** Moves that give away more win-% than this are never played. */
  maxLoss: number
  /** Forced mates up to this many moves are always played; longer ones only by chance. */
  seesMateIn: number
}

/**
 * Levels 1–8, weakest first. A first guess: matches between the levels set the final values and
 * an approximate rating per level.
 */
export const BOT_LEVELS: readonly BotLevel[] = [
  {
    level: 1,
    name: 'Beginner',
    nodes: 5_000,
    candidates: 10,
    temperature: 20,
    maxLoss: 70,
    seesMateIn: 1,
  },
  {
    level: 2,
    name: 'Novice',
    nodes: 10_000,
    candidates: 8,
    temperature: 14,
    maxLoss: 50,
    seesMateIn: 1,
  },
  {
    level: 3,
    name: 'Casual',
    nodes: 20_000,
    candidates: 8,
    temperature: 9,
    maxLoss: 35,
    seesMateIn: 2,
  },
  {
    level: 4,
    name: 'Club',
    nodes: 40_000,
    candidates: 6,
    temperature: 6,
    maxLoss: 25,
    seesMateIn: 2,
  },
  {
    level: 5,
    name: 'Intermediate',
    nodes: 80_000,
    candidates: 5,
    temperature: 4,
    maxLoss: 15,
    seesMateIn: 3,
  },
  {
    level: 6,
    name: 'Advanced',
    nodes: 150_000,
    candidates: 4,
    temperature: 2.5,
    maxLoss: 10,
    seesMateIn: 4,
  },
  {
    level: 7,
    name: 'Expert',
    nodes: 300_000,
    candidates: 3,
    temperature: 1.2,
    maxLoss: 6,
    seesMateIn: 6,
  },
  {
    level: 8,
    name: 'Master',
    nodes: 1_000_000,
    candidates: 2,
    temperature: 0.4,
    maxLoss: 3,
    seesMateIn: 99,
  },
]

/** The level with that number; throws for an unknown one. */
export function botLevel(level: number): BotLevel {
  const found = BOT_LEVELS.find((l) => l.level === level)
  if (!found) throw new RangeError(`No bot level ${level}`)
  return found
}
