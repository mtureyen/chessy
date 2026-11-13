import {
  MIN_OPENING_GAMES,
  writePlayerSummary,
  type CancelSignal,
  type CoachAgent,
  type PlayerSummaryFacts,
  type SummaryErrors,
  type SummaryTally,
} from '@pawnia/coach'
import type { PlayerStatsBody, PlayerSummaryBody } from '@pawnia/contracts'
import type { PlayerSummaryService } from './statsService'

type Stats = PlayerStatsBody
type Tally = Stats['record']
type Line = Stats['repertoire']['white'][number]
type Errors = NonNullable<Stats['quality']>['errorsPerGame']

/** The most of each list the coach reads: the rest is the long tail, not how someone plays. */
const OPENINGS = 6
const FIRST_MOVES = 3
const RATINGS = 3

const PLATFORMS = { chesscom: 'chess.com', lichess: 'lichess', bot: 'pawnia bots', local: 'here' }

const ENDINGS: Record<Stats['endings']['wins'][number]['reason'], string> = {
  checkmate: 'checkmate',
  resignation: 'resignation',
  time: 'on time',
  abandoned: 'abandoned',
  agreement: 'agreed',
  repetition: 'repetition',
  stalemate: 'stalemate',
  'insufficient-material': 'insufficient material',
  'fifty-move-rule': '50-move rule',
  'timeout-vs-insufficient': 'time out with too little to mate',
  other: 'other',
}

const DAY_PARTS = {
  night: 'night (0-6)',
  morning: 'morning (6-12)',
  afternoon: 'afternoon (12-18)',
  evening: 'evening (18-24)',
}

/**
 * The coach's summaries of the stats page's numbers. Nothing is kept: a summary is cheap to ask
 * for again, and a looked-up player's numbers are not stored by design.
 */
export class PlayerSummaries implements PlayerSummaryService {
  private readonly now: () => Date
  /** The writing going on, by what is written: asked again meanwhile, the coach isn't. */
  private readonly writing = new Map<string, Promise<PlayerSummaryBody>>()

  constructor(now = () => new Date()) {
    this.now = now
  }

  /**
   * Asked for the same summary while it is being written (a second click, the page shown again),
   * this waits for that one: the coach must not be paid twice for the same writing.
   */
  write(stats: Stats, agent: CoachAgent, signal?: CancelSignal): Promise<PlayerSummaryBody> {
    const { last, speed } = stats.window
    const key = [whose(stats), last, speed ?? 'all', stats.activity.timeZone, agent.id].join(' ')
    const going = this.writing.get(key)
    if (going) return going
    const started = this.writeSummary(stats, agent, signal).finally(() => this.writing.delete(key))
    this.writing.set(key, started)
    return started
  }

  private async writeSummary(
    stats: Stats,
    agent: CoachAgent,
    signal?: CancelSignal,
  ): Promise<PlayerSummaryBody> {
    const { summary, focus } = await writePlayerSummary(agent, summaryFacts(stats), signal)
    return {
      kind: stats.player.kind,
      summary,
      focus,
      agent: agent.label,
      writtenAt: this.now().toISOString(),
    }
  }
}

function whose({ player }: Stats): string {
  return player.kind === 'me'
    ? 'me'
    : `${player.profile.source} ${player.profile.username.toLowerCase()}`
}

/**
 * What the coach reads of the page's numbers: cut down to what describes how someone plays, as
 * numbers it can quote, without the games themselves. Move quality only for the user's own games:
 * a looked-up player's games are not reviewed here, and a platform's own analysis is never used.
 */
export function summaryFacts(stats: Stats): PlayerSummaryFacts {
  const common = {
    name: stats.player.kind === 'me' ? stats.player.displayName : stats.player.profile.username,
    window: {
      games: stats.window.found,
      ...(stats.window.speed && { speed: stats.window.speed }),
      ...(stats.window.since && { since: stats.window.since.slice(0, 10) }),
    },
    record: tally(stats.record),
    ratings: stats.ratings
      .filter((s) => s.points.length > 0)
      .slice(0, RATINGS)
      .map((s) => ({
        series: `${PLATFORMS[s.category]} ${s.speed}`,
        start: s.points[0]!.rating,
        end: s.points.at(-1)!.rating,
        games: s.points.length,
      })),
    openings: { white: openings(stats, 'white'), black: openings(stats, 'black') },
    firstMoves: { asWhite: firstMoves(stats), asBlack: replies(stats) },
    endings: {
      wins: endings(stats.endings.wins),
      losses: endings(stats.endings.losses),
      draws: endings(stats.endings.draws),
      ...(stats.endings.averageMoves !== undefined && {
        averageMoves: stats.endings.averageMoves,
      }),
    },
    opponents: stats.opponents.map((o) => ({ group: o.key, ...tally(o.tally) })),
    timeOfDay: {
      timeZone: stats.activity.timeZone,
      parts: stats.activity.dayParts
        .filter((p) => p.tally.games > 0)
        .map((p) => ({ part: DAY_PARTS[p.key], ...tally(p.tally) })),
    },
  }
  if (stats.player.kind === 'lookup') {
    return { kind: 'opponent', platform: PLATFORMS[stats.player.profile.source], ...common }
  }
  const quality = stats.quality
  return {
    kind: 'own',
    ...common,
    ...(quality && {
      moveQuality: {
        reviewedGames: quality.reviewedGames,
        ...(quality.averageAccuracy !== undefined && {
          averageAccuracy: quality.averageAccuracy,
        }),
        perGame: errors(quality.errorsPerGame, 1),
        phases: {
          opening: phase(quality.phases.opening, quality.reviewedGames),
          middlegame: phase(quality.phases.middlegame, quality.reviewedGames),
          endgame: phase(quality.phases.endgame, quality.reviewedGames),
        },
      },
    }),
  }
}

/** A tally without the unfinished games: they have no result to talk about. */
function tally({ games, wins, draws, losses, score }: Tally): SummaryTally {
  return { games, wins, draws, losses, ...(score !== undefined && { score }) }
}

function openings(stats: Stats, color: 'white' | 'black') {
  return stats.openings[color]
    .filter((o) => o.tally.games >= MIN_OPENING_GAMES && o.family !== 'Unknown opening')
    .sort((a, b) => b.tally.games - a.tally.games)
    .slice(0, OPENINGS)
    .map((o) => ({ name: o.family, ...tally(o.tally) }))
}

/** White's first moves, with their share of the White games. */
function firstMoves(stats: Stats) {
  const roots = byGames(stats.repertoire.white.filter((line) => line.moves.length === 1))
  const total = roots.reduce((sum, line) => sum + line.tally.games, 0)
  return roots.slice(0, FIRST_MOVES).map((line) => ({
    move: moveText(line.moves),
    share: Math.round((line.tally.games / total) * 100),
    ...tally(line.tally),
  }))
}

/** As Black: the most played answer to each of White's most common first moves. */
function replies(stats: Stats) {
  const lines = stats.repertoire.black
  return byGames(lines.filter((line) => line.moves.length === 1))
    .filter((first) => first.tally.games >= MIN_OPENING_GAMES)
    .slice(0, FIRST_MOVES)
    .flatMap((first) => {
      const [reply] = byGames(
        lines.filter((line) => line.moves.length === 2 && line.moves[0] === first.moves[0]),
      )
      if (!reply) return []
      return [
        {
          against: moveText(first.moves),
          reply: moveText(reply.moves),
          ...(reply.opening && { opening: reply.opening }),
          games: reply.tally.games,
          of: first.tally.games,
          ...(reply.tally.score !== undefined && { score: reply.tally.score }),
        },
      ]
    })
}

function byGames(lines: Line[]): Line[] {
  return [...lines].sort((a, b) => b.tally.games - a.tally.games)
}

/** The last move of a line with its number: "1.e4", "1...c5". */
function moveText(moves: readonly string[]): string {
  const ply = moves.length
  return `${Math.ceil(ply / 2)}${ply % 2 === 1 ? '.' : '...'}${moves.at(-1) ?? ''}`
}

function endings(counts: Stats['endings']['wins']) {
  return counts.map((c) => ({ how: ENDINGS[c.reason], games: c.games }))
}

/** Errors per game, to one decimal. */
function errors(counts: Errors, games: number): SummaryErrors {
  const per = (n: number) => (games > 0 ? Math.round((n / games) * 10) / 10 : 0)
  return {
    blunders: per(counts.blunder),
    mistakes: per(counts.mistake),
    misses: per(counts.miss),
    inaccuracies: per(counts.inaccuracy),
  }
}

function phase(
  { moves, errors: counts }: NonNullable<Stats['quality']>['phases']['opening'],
  games: number,
) {
  return { moves, ...errors(counts, games) }
}
