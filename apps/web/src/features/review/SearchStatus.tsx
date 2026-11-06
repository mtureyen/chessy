import { Markdown } from '@/features/coach/Markdown'
import type { Search } from './useMoveTry'

/** What the coach says while the user looks for the move, and to each try. */
export function SearchStatus({ search }: { search: Search }) {
  switch (search.status) {
    case 'looking':
      return <p className="walkthrough-search">Your move: play something better on the board.</p>
    case 'checking':
      return <p className="walkthrough-search">Checking {search.san}…</p>
    case 'failed':
      return (
        <p className="message message-error" role="alert">
          {search.message}
        </p>
      )
    case 'judged': {
      const { verdict, san, comment } = search.answer
      if (verdict === 'right') {
        return <p className="walkthrough-search walkthrough-right">Yes, {san} works!</p>
      }
      if (verdict === 'played') {
        return <p className="walkthrough-search">That's the move you played in the game.</p>
      }
      if (verdict === 'close') {
        return (
          <p className="walkthrough-search">{san} is decent, but there's something stronger.</p>
        )
      }
      return (
        <div className="walkthrough-search">
          <p>{san} isn't it.</p>
          {comment && <Markdown text={comment} />}
        </div>
      )
    }
  }
}
