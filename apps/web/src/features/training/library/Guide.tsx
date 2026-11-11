import type { LibraryOpeningBody, OpeningGuideBody } from '@pawnia/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useServices } from '@/app/servicesContext'
import { Markdown } from '@/features/coach/Markdown'

/** "2.d4", "2...d5": a move with its number, from its half-move. */
function moveLabel(ply: number, san: string): string {
  const number = Math.ceil(ply / 2)
  return ply % 2 === 1 ? `${number}.${san}` : `${number}...${san}`
}

/**
 * The coach's study guide of an opening: the story and name, the ideas, what opponents try, and
 * the main line move by move. Written once on request (it costs a model turn) and kept.
 */
export function Guide({
  opening,
  path,
  onPath,
}: {
  opening: LibraryOpeningBody
  path: string[]
  onPath: (path: string[]) => void
}) {
  const { openingLibrary } = useServices()
  const client = useQueryClient()
  const key = ['opening-library', opening.id, 'guide']
  const kept = useQuery({ queryKey: key, queryFn: () => openingLibrary.guide(opening.id) })
  const write = useMutation({
    mutationFn: (regenerate: boolean) => openingLibrary.writeGuide(opening.id, regenerate),
    onSuccess: (guide) => client.setQueryData(key, guide),
  })

  if (kept.isPending) return null
  const guide = kept.data
  const writing = write.isPending
  const error = write.error ?? kept.error
  if (!guide) {
    return (
      <section className="stats-section library-guide" aria-label="Guide">
        <h2>Guide</h2>
        <p>
          The coach can write a guide to the {opening.name}: where the name comes from and its
          history, the ideas behind it, what opponents try, and every move of the main line
          explained. It's written once and kept.
        </p>
        <button
          type="button"
          className="openings-practise"
          disabled={writing}
          onClick={() => write.mutate(false)}
        >
          {writing ? 'The coach is writing… (up to a minute)' : 'Write the guide'}
        </button>
        <p className="stats-note">With the Claude API as coach this is one paid request.</p>
        {error && (
          <p className="message message-error" role="alert">
            {error.message}
          </p>
        )}
      </section>
    )
  }
  return (
    <WrittenGuide
      guide={guide}
      path={path}
      onPath={onPath}
      onRewrite={() => write.mutate(true)}
      writing={writing}
      error={error}
    />
  )
}

function WrittenGuide({
  guide,
  path,
  onPath,
  onRewrite,
  writing,
  error,
}: {
  guide: OpeningGuideBody
  path: string[]
  onPath: (path: string[]) => void
  onRewrite: () => void
  writing: boolean
  error: Error | null
}) {
  const sans = guide.moves.map((m) => m.san)
  return (
    <section className="stats-section library-guide" aria-label="Guide">
      <h2>Guide</h2>
      <div className="stats-columns">
        <div>
          <h3>The story</h3>
          <Markdown text={guide.story} />
          <h3>The ideas</h3>
          <Markdown text={guide.ideas} />
          <h3>What opponents try</h3>
          <Markdown text={guide.opponents} />
        </div>
        <div>
          <h3>The main line, move by move</h3>
          <ol className="library-guide-moves">
            {guide.moves.map((move) => {
              const to = sans.slice(0, move.ply)
              return (
                <li key={move.ply}>
                  <button
                    type="button"
                    className="library-move"
                    aria-current={path.join(' ') === to.join(' ') ? 'true' : undefined}
                    onClick={() => onPath(to)}
                  >
                    {moveLabel(move.ply, move.san)}
                  </button>{' '}
                  {move.note}
                </li>
              )
            })}
          </ol>
        </div>
      </div>
      <p className="stats-note">
        Written by {guide.agent} on{' '}
        {new Date(guide.writtenAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}.{' '}
        <button type="button" className="library-more" disabled={writing} onClick={onRewrite}>
          {writing ? 'Writing…' : 'Write it again'}
        </button>
      </p>
      {error && (
        <p className="message message-error" role="alert">
          {error.message}
        </p>
      )}
    </section>
  )
}
