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
  /**
   * Estimated rating from engine matches (`bun run bots:calibrate`), as the level plays in the app
   * (human-like where it has a human style): anchored to Stockfish's UCI_Elo, so a rough guide to
   * human ratings rather than a measurement of them.
   */
  rating?: number
  /**
   * Plays like a human of a rating (a human-move model such as Maia) instead of from the engine's
   * ranking, when such a model is available; the engine settings above are the fallback.
   */
  human?: HumanStyle
}

/** How a human-like level samples from the human-move model (see `sampleHumanMove`). */
export interface HumanStyle {
  /** The rating the model imitates. */
  elo: number
  /** Above 1: less common moves more often (weaker); below 1: the most common ones (stronger). */
  temperature: number
  /** Only moves within this share of the probability mass, most likely first. */
  topP: number
}

/**
 * Levels 1–8, weakest first. Ratings come from engine matches (`bun run bots:calibrate`, Nov
 * 2026, 1220 games): levels 1–6 as they play with the human-move model (Maia), whose settings were
 * interpolated from a grid of Maia settings measured beforehand; 7–8 on the browser's engine.
 * Anchored to Stockfish at UCI_Elo 1400/1800/2200; standard errors ±40–55.
 * Without the model, levels 1–6 play from the engine settings, measured at 550 / 792 / 1182 /
 * 1458 / 1737 / 1985.
 */
export const BOT_LEVELS: readonly BotLevel[] = [
  {
    level: 1,
    name: 'Beginner',
    nodes: 1500,
    candidates: 16,
    temperature: 36,
    maxLoss: 100,
    seesMateIn: 1,
    rating: 485,
    human: { elo: 620, temperature: 2.5, topP: 0.95 },
  },
  {
    level: 2,
    name: 'Novice',
    nodes: 3000,
    candidates: 12,
    temperature: 26,
    maxLoss: 85,
    seesMateIn: 1,
    rating: 665,
    human: { elo: 700, temperature: 2.15, topP: 0.95 },
  },
  {
    level: 3,
    name: 'Casual',
    nodes: 6000,
    candidates: 9,
    temperature: 18,
    maxLoss: 65,
    seesMateIn: 1,
    rating: 1111,
    human: { elo: 1025, temperature: 1.5, topP: 0.95 },
  },
  {
    level: 4,
    name: 'Club',
    nodes: 13_000,
    candidates: 8,
    temperature: 12,
    maxLoss: 45,
    seesMateIn: 2,
    rating: 1395,
    human: { elo: 1400, temperature: 1, topP: 0.98 },
  },
  {
    level: 5,
    name: 'Intermediate',
    nodes: 22_000,
    candidates: 7,
    temperature: 9,
    maxLoss: 35,
    seesMateIn: 2,
    rating: 1726,
    human: { elo: 1900, temperature: 0.95, topP: 0.98 },
  },
  {
    level: 6,
    name: 'Advanced',
    nodes: 37_000,
    candidates: 6,
    temperature: 6.8,
    maxLoss: 27,
    seesMateIn: 3,
    rating: 1885,
    human: { elo: 1900, temperature: 0.5, topP: 0.98 },
  },
  {
    level: 7,
    name: 'Expert',
    nodes: 56_000,
    candidates: 6,
    temperature: 5.2,
    maxLoss: 20,
    seesMateIn: 4,
    rating: 2249,
  },
  {
    level: 8,
    name: 'Master',
    nodes: 70_000,
    candidates: 5,
    temperature: 4.5,
    maxLoss: 17,
    seesMateIn: 5,
    rating: 2469,
  },
]

/** "~1400" for a level with a measured rating. */
export function approximateRating(level: BotLevel): string | undefined {
  return level.rating === undefined ? undefined : `~${Math.round(level.rating / 50) * 50}`
}

/** The level with that number; throws for an unknown one. */
export function botLevel(level: number): BotLevel {
  const found = BOT_LEVELS.find((l) => l.level === level)
  if (!found) throw new RangeError(`No bot level ${level}`)
  return found
}
