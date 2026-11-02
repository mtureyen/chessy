/** One game between two named players; `score` is White's: 1, ½ or 0. */
export interface RatedGame {
  white: string
  black: string
  score: number
}

export interface RatingEstimate {
  rating: number
  /** One standard error, in rating points; 0 for anchors. */
  error: number
  games: number
  /** Points scored per game (0–1). */
  score: number
}

/** Elo's logistic: rating points per factor of 10 in the odds. */
const SCALE = Math.LN10 / 400

/**
 * Maximum-likelihood ratings (Bradley–Terry on the Elo scale, a draw is half a win) with the
 * anchors fixed at their known ratings. One virtual draw per pairing keeps perfect scores finite.
 * Throws when there is no anchor or a player has no path to one.
 */
export function estimateRatings(
  games: readonly RatedGame[],
  anchors: Readonly<Record<string, number>>,
): Record<string, RatingEstimate> {
  if (Object.keys(anchors).length === 0) throw new Error('At least one anchor is needed')
  const pairs = new Map<string, { a: string; b: string; games: number; scoreA: number }>()
  const players = new Set<string>()
  for (const game of games) {
    players.add(game.white).add(game.black)
    const [a, b] = [game.white, game.black].sort() as [string, string]
    const pair = pairs.get(`${a}\n${b}`) ?? { a, b, games: 0, scoreA: 0 }
    pair.games++
    pair.scoreA += a === game.white ? game.score : 1 - game.score
    pairs.set(`${a}\n${b}`, pair)
  }
  assertConnected(players, [...pairs.values()], anchors)

  const ratings = new Map<string, number>()
  for (const player of players) ratings.set(player, anchors[player] ?? meanAnchor(anchors))
  // Newton steps per player, the others held fixed, until nothing moves.
  for (let sweep = 0; sweep < 500; sweep++) {
    let largest = 0
    for (const player of players) {
      if (player in anchors) continue
      const { gradient, information } = fit(player, ratings, pairs.values())
      const step = gradient / information
      ratings.set(player, ratings.get(player)! + step)
      largest = Math.max(largest, Math.abs(step))
    }
    if (largest < 0.01) break
  }

  const result: Record<string, RatingEstimate> = {}
  for (const player of players) {
    const { information } = fit(player, ratings, pairs.values())
    let played = 0
    let scored = 0
    for (const pair of pairs.values()) {
      if (pair.a !== player && pair.b !== player) continue
      played += pair.games
      scored += pair.a === player ? pair.scoreA : pair.games - pair.scoreA
    }
    result[player] = {
      rating: ratings.get(player)!,
      error: player in anchors ? 0 : 1 / Math.sqrt(information),
      games: played,
      score: played ? scored / played : 0,
    }
  }
  return result
}

/** Expected score of a player rated `a` against one rated `b`. */
export function expectedScore(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400))
}

/** Gradient and Fisher information of the log-likelihood in the player's rating (Elo units). */
function fit(
  player: string,
  ratings: ReadonlyMap<string, number>,
  pairs: Iterable<{ a: string; b: string; games: number; scoreA: number }>,
) {
  let gradient = 0
  let information = 0
  for (const pair of pairs) {
    if (pair.a !== player && pair.b !== player) continue
    const opponent = pair.a === player ? pair.b : pair.a
    // The virtual draw: one more game, half a point.
    const games = pair.games + 1
    const scored = (pair.a === player ? pair.scoreA : pair.games - pair.scoreA) + 0.5
    const expected = expectedScore(ratings.get(player)!, ratings.get(opponent)!)
    // d/dr of s·ln E + (n − s)·ln(1 − E), with dE/dr = SCALE·E·(1 − E).
    gradient += SCALE * (scored - games * expected)
    information += SCALE * SCALE * games * expected * (1 - expected)
  }
  return { gradient, information }
}

function meanAnchor(anchors: Readonly<Record<string, number>>): number {
  const values = Object.values(anchors)
  return values.reduce((sum, r) => sum + r, 0) / values.length
}

function assertConnected(
  players: Set<string>,
  pairs: readonly { a: string; b: string }[],
  anchors: Readonly<Record<string, number>>,
) {
  const reached = new Set(Object.keys(anchors).filter((a) => players.has(a)))
  for (let grew = true; grew;) {
    grew = false
    for (const { a, b } of pairs) {
      if (reached.has(a) !== reached.has(b)) {
        reached.add(a).add(b)
        grew = true
      }
    }
  }
  const lost = [...players].filter((p) => !reached.has(p))
  if (lost.length) throw new Error(`No games connect ${lost.join(', ')} to an anchor`)
}
