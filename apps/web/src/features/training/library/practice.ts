import { BAND_LABELS, games, scoreOf, type BandChoice, type Results } from './format'

/** A move played in a position of the library, with its results at the chosen rating. */
export interface Answer {
  san: string
  r: Results
}

/** A move must be played this often among the answers to be worth pointing at. */
const COMMON_SHARE = 0.1

/** Who the library's numbers are about: "players rated 1200–1599", "players of all ratings". */
export function bandPlayers(band: BandChoice): string {
  return band === 'all'
    ? 'players of all ratings'
    : `players rated ${BAND_LABELS[band].toLowerCase()}`
}

/**
 * What to do after a reply that leaves the opening's named lines, from what real games did:
 * the answer played most, and the common answer that scores best for the user's side when it is
 * another one. Undefined when the library has no games from there.
 */
export function answersText(
  answers: readonly Answer[],
  side: 'white' | 'black',
  band: BandChoice,
  label: (san: string) => string,
): string | undefined {
  const played = answers.filter((a) => games(a.r) > 0).sort((a, b) => games(b.r) - games(a.r))
  const total = played.reduce((sum, a) => sum + games(a.r), 0)
  const most = played[0]
  if (!most) return undefined
  const share = (a: Answer) => Math.round((games(a.r) / total) * 100)
  const best = played
    .filter((a) => games(a.r) / total >= COMMON_SHARE)
    .sort((a, b) => (scoreOf(b.r, side) ?? 0) - (scoreOf(a.r, side) ?? 0))[0]
  const who = bandPlayers(band)
  const mostText = `${who.charAt(0).toUpperCase()}${who.slice(1)} answer most with ${label(most.san)} (${share(most)}%)`
  return best && best.san !== most.san
    ? `${mostText}; ${label(best.san)} scores best (${scoreOf(best.r, side)}%).`
    : `${mostText}, scoring ${scoreOf(most.r, side)}%.`
}
