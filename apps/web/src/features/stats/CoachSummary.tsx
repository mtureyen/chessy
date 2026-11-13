import type { PlayerStatsBody, PlayerSummaryBody } from '@pawnia/contracts'
import {
  skipToken,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { StatsPlayer } from '@/adapters/api/remoteStats'
import { useServices } from '@/app/servicesContext'
import { Markdown } from '@/features/coach/Markdown'

/**
 * The coach's reading of the numbers below: how the player plays, and for the user the one thing
 * to work on first, for anyone else how to meet them. Written on request (it costs a model turn)
 * and kept in the browser for these filters; the server keeps nothing.
 */
export function CoachSummary({ stats }: { stats: PlayerStatsBody }) {
  const services = useServices()
  const client = useQueryClient()
  const own = stats.player.kind === 'me'
  const name = stats.player.kind === 'lookup' ? stats.player.profile.username : 'you'
  const player: StatsPlayer =
    stats.player.kind === 'me'
      ? { kind: 'me' }
      : {
          kind: 'lookup',
          source: stats.player.profile.source,
          username: stats.player.profile.username,
        }
  // The numbers shown, not the filters just picked: while new ones load, the old ones are on screen.
  const { last, speed } = stats.window
  const who = player.kind === 'me' ? 'me' : `${player.source}:${player.username.toLowerCase()}`
  const key = ['stats-summary', who, last, speed ?? 'all']
  // Only ever filled by a writing: asking the server is asking the coach, never done by itself.
  const kept = useQuery<PlayerSummaryBody>({
    queryKey: key,
    queryFn: skipToken,
    staleTime: Infinity,
    gcTime: Infinity,
  })
  // Keyed, so that a writing started before the page was shown again still counts: the button
  // must not offer a second, paid, writing while the first runs.
  const writeKey = [...key, 'write']
  const write = useMutation({
    mutationKey: writeKey,
    mutationFn: () => services.stats.summary(player, { last, ...(speed && { speed }) }),
    onSuccess: (summary) => client.setQueryData(key, summary),
  })
  const writing = useIsMutating({ mutationKey: writeKey }) > 0
  const summary = kept.data

  return (
    <section className="stats-section stats-coach" aria-label="Coach summary">
      <h2>Coach summary</h2>
      {!summary ? (
        <>
          <p>
            {own
              ? 'The coach reads these numbers and says how you play and the one thing to work on first.'
              : `The coach reads these numbers and says how ${name} plays and how to meet them. Their games are not reviewed here, so it says nothing about how well they move.`}
          </p>
          <button
            type="button"
            className="stats-coach-write"
            disabled={writing}
            onClick={() => write.mutate()}
          >
            {writing ? 'The coach is writing… (up to a minute)' : 'Write the summary'}
          </button>
        </>
      ) : (
        <div className="stats-columns">
          <div>
            <h3>{own ? 'How you play' : `How ${name} plays`}</h3>
            <Markdown text={summary.summary} />
          </div>
          <div>
            <h3>{own ? 'Work on first' : 'How to meet them'}</h3>
            <Markdown text={summary.focus} />
          </div>
        </div>
      )}
      <p className="stats-note">
        {summary && (
          <>
            Written by {summary.agent} from these numbers.{' '}
            <button
              type="button"
              className="stats-coach-again"
              disabled={writing}
              onClick={() => write.mutate()}
            >
              {writing ? 'Writing… (up to a minute)' : 'Write it again'}
            </button>{' '}
          </>
        )}
        With the Claude API as coach this is one paid request.
      </p>
      {write.error && (
        <p className="message message-error" role="alert">
          {write.error.message}
        </p>
      )}
    </section>
  )
}
