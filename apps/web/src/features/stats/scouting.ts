import type { PlayerStatsBody } from '@pawnia/contracts'
import { lastMove, percent, type Tally } from './format'

type Stats = PlayerStatsBody

/** What counts as standing out: enough games, and far enough from the player's own score. */
const MIN_GAMES = 4
const WEAK_SCORE = 35
const STRONG_SCORE = 70
const MIN_TIME_LOSSES = 4
const TIME_LOSS_SHARE = 35
const MIN_PART_GAMES = 5
const PART_GAP = 15

const DAY_PARTS = {
  night: 'at night',
  morning: 'in the morning',
  afternoon: 'in the afternoon',
  evening: 'in the evening',
}

/**
 * A few plain sentences on how to meet this player, from their numbers alone (no model): what
 * they open with and answer, where they score badly or well, how they lose. Empty when nothing
 * stands out.
 */
export function scouting(stats: Stats): string[] {
  return [
    ...firstMoves(stats),
    ...replies(stats),
    ...openingExtremes(stats),
    ...timeLosses(stats),
    ...dayParts(stats),
  ]
}

function firstMoves(stats: Stats): string[] {
  const roots = stats.repertoire.white.filter((line) => line.moves.length === 1)
  const total = stats.openings.white.reduce((sum, o) => sum + o.tally.games, 0)
  const [top] = roots
  if (!top || total === 0) return []
  const share = percent(top.tally.games, total)
  const favourite = stats.openings.white.find(
    (o) => o.tally.games >= MIN_GAMES && o.family !== 'Unknown opening',
  )
  return [
    `As White ${share >= 75 ? 'almost always' : share >= 50 ? 'mostly' : 'most often'} ${lastMove(top.moves)} (${share}% of ${total} games, scoring ${score(top.tally)})` +
      (favourite
        ? `; most common in their White games: ${favourite.family} (${favourite.tally.games} games, ${score(favourite.tally)}).`
        : '.'),
  ]
}

function replies(stats: Stats): string[] {
  const lines = stats.repertoire.black
  return lines
    .filter((line) => line.moves.length === 1 && line.tally.games >= MIN_GAMES)
    .slice(0, 2)
    .flatMap((first) => {
      const reply = lines.find(
        (line) => line.moves.length === 2 && line.moves[0] === first.moves[0],
      )
      if (!reply) return []
      const name = reply.opening ? ` (${reply.opening})` : ''
      return [
        `Against ${lastMove(first.moves)} they answer ${lastMove(reply.moves)}${name} in ${reply.tally.games} of ${first.tally.games} games, scoring ${score(reply.tally)}.`,
      ]
    })
}

function openingExtremes(stats: Stats): string[] {
  const all = (['white', 'black'] as const).flatMap((color) =>
    stats.openings[color]
      .filter(
        (o) =>
          o.tally.games >= MIN_GAMES &&
          o.tally.score !== undefined &&
          o.family !== 'Unknown opening',
      )
      .map((o) => ({ ...o, color: color === 'white' ? 'White' : 'Black' })),
  )
  const weak = all
    .filter((o) => o.tally.score! <= WEAK_SCORE)
    .sort((a, b) => a.tally.score! - b.tally.score!)
  const strong = all
    .filter((o) => o.tally.score! >= STRONG_SCORE)
    .sort((a, b) => b.tally.games - a.tally.games)
  return [
    ...weak
      .slice(0, 2)
      .map(
        (o) =>
          `Scores badly in ${o.family} games with ${o.color}: ${score(o.tally)} in ${o.tally.games}.`,
      ),
    ...strong
      .slice(0, 1)
      .map(
        (o) =>
          `Scores well in ${o.family} games with ${o.color}: ${score(o.tally)} in ${o.tally.games}.`,
      ),
  ]
}

function timeLosses(stats: Stats): string[] {
  const losses = stats.endings.losses.reduce((sum, c) => sum + c.games, 0)
  const onTime = stats.endings.losses.find((c) => c.reason === 'time')?.games ?? 0
  const share = percent(onTime, losses)
  if (onTime < MIN_TIME_LOSSES || share < TIME_LOSS_SHARE) return []
  return [
    `${share}% of their losses are on time (${onTime} of ${losses}): keep the game long and the clock busy.`,
  ]
}

function dayParts(stats: Stats): string[] {
  const overall = stats.record.score
  if (overall === undefined) return []
  return stats.activity.dayParts
    .filter((p) => p.tally.games >= MIN_PART_GAMES && p.tally.score !== undefined)
    .filter((p) => overall - p.tally.score! >= PART_GAP)
    .map(
      (p) =>
        `Weaker ${DAY_PARTS[p.key]}: ${score(p.tally)} against ${overall}% overall (${p.tally.games} games, ${stats.activity.timeZone} time).`,
    )
}

function score(tally: Tally): string {
  return tally.score === undefined ? 'no score' : `${tally.score}%`
}
