import { createGame, type Color } from '@chessy/chess'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Board } from '@/shared/board/Board'
import { Markdown } from './Markdown'
import type {
  ChatMessage,
  CoachContext,
  CoachMessage,
  PlacedDrawing,
  useCoachChat,
} from './useCoachChat'
import './CoachPanel.css'

/** What the coach's tools look like to the user while it works. */
const TOOL_LABELS: Record<string, string> = {
  evaluate_position: 'engine',
  human_moves: 'human moves',
  search_games: 'your games',
  stats: 'your stats',
  game_review: 'game review',
  show_on_board: 'drawing',
}

const NO_MOVES = new Map()

const SUGGESTIONS = [
  'Who stands better here, and why?',
  'What should I play here?',
  'Where did this game go wrong?',
  'What are my most common mistakes?',
]

export interface CoachPanelProps {
  chat: ReturnType<typeof useCoachChat>
  /** The situation a question is asked in, read when it is sent. */
  context: () => CoachContext
  /** Whether the main board can show this position (it is in the game). */
  canShow: (fen: string) => boolean
  onShow: (drawing: PlacedDrawing) => void
  orientation: Color
}

/** Talk to the coach about the position and the game on the board. */
export function CoachPanel({ chat, context, canShow, onShow, orientation }: CoachPanelProps) {
  const [draft, setDraft] = useState('')
  const list = useRef<HTMLDivElement>(null)
  const { agents, agent, messages, answering } = chat

  const last = messages.at(-1)
  const lastLength = last?.text.length ?? 0
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight })
  }, [messages.length, lastLength])

  const send = (question: string) => {
    const text = question.trim()
    if (!text || answering || !agent) return
    setDraft('')
    void chat.ask(text, context())
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(draft)
    }
  }

  if (agents.isPending) return <p className="coach-note">Looking for the coach…</p>
  if (!agent) {
    const reasons = (agents.data ?? [])
      .filter((a) => a.reason)
      .map((a) => `${a.label}: ${a.reason}`)
    return (
      <div className="coach-note">
        <p>
          {agents.isError ? 'The coach is not reachable.' : 'No coach is ready to answer.'}{' '}
          <Link to="/settings" search={{ tab: 'coach' }}>
            Set one up in Settings → Coach
          </Link>
        </p>
        {reasons.length > 0 && (
          <ul>
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="coach">
      <div className="coach-bar">
        <select
          aria-label="Coach"
          value={agent.id}
          onChange={(e) => chat.choose(e.target.value)}
          disabled={answering}
        >
          {(agents.data ?? []).map((a) => (
            <option key={a.id} value={a.id} disabled={!a.available} title={a.reason}>
              {a.label}
              {a.available ? '' : ' (not ready)'}
            </option>
          ))}
        </select>
        <button type="button" onClick={chat.reset} disabled={messages.length === 0}>
          New chat
        </button>
      </div>

      <div className="coach-messages" ref={list} aria-live="polite">
        {messages.length === 0 ? (
          <div className="coach-suggestions">
            <p>Ask about the position or the game on the board, or about your games.</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        ) : (
          messages.map((message) => (
            <Message
              key={message.id}
              message={message}
              canShow={canShow}
              onShow={onShow}
              orientation={orientation}
            />
          ))
        )}
      </div>

      <form
        className="coach-compose"
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
      >
        <textarea
          aria-label="Your question"
          placeholder="Ask the coach…"
          rows={2}
          value={draft}
          maxLength={4000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {answering ? (
          <button type="button" onClick={chat.stop}>
            Stop
          </button>
        ) : (
          <button type="submit" className="primary" disabled={!draft.trim()}>
            Ask
          </button>
        )}
      </form>
    </div>
  )
}

function Message({
  message,
  canShow,
  onShow,
  orientation,
}: {
  message: ChatMessage
  canShow: (fen: string) => boolean
  onShow: (drawing: PlacedDrawing) => void
  orientation: Color
}) {
  if (message.role === 'user') return <div className="coach-message coach-user">{message.text}</div>
  return (
    <div className="coach-message coach-reply" data-status={message.status}>
      <Tools tools={message.tools} />
      {message.text ? (
        <Markdown text={message.text} />
      ) : (
        message.status === 'answering' && <p className="coach-thinking">Thinking…</p>
      )}
      {message.drawings.map((drawing, i) =>
        canShow(drawing.fen) ? (
          <button key={i} type="button" className="coach-show" onClick={() => onShow(drawing)}>
            Show on the board
          </button>
        ) : (
          <MiniBoard key={i} drawing={drawing} orientation={orientation} />
        ),
      )}
      {message.status === 'stopped' && <p className="coach-meta">Stopped.</p>}
      {message.error && <p className="message message-error">{message.error}</p>}
      {message.usage && (
        <p className="coach-meta">
          {tokens(message.usage.inputTokens)} in / {tokens(message.usage.outputTokens)} out tokens
        </p>
      )}
    </div>
  )
}

function Tools({ tools }: { tools: CoachMessage['tools'] }) {
  if (tools.length === 0) return null
  const counted = new Map<string, { count: number; running: boolean; failed: boolean }>()
  for (const tool of tools) {
    const label = TOOL_LABELS[tool.name] ?? tool.name
    const entry = counted.get(label) ?? { count: 0, running: false, failed: false }
    counted.set(label, {
      count: entry.count + 1,
      running: entry.running || tool.ok === undefined,
      failed: entry.failed || tool.ok === false,
    })
  }
  return (
    <ul className="coach-tools" aria-label="Tools used">
      {[...counted].map(([label, { count, running, failed }]) => (
        <li key={label} data-running={running || undefined} data-failed={failed || undefined}>
          {label}
          {count > 1 && ` ×${count}`}
        </li>
      ))}
    </ul>
  )
}

/** A position that isn't in the game on the board, shown small with what the coach drew. */
function MiniBoard({ drawing, orientation }: { drawing: PlacedDrawing; orientation: Color }) {
  const game = createGame(drawing.fen)
  return (
    <div className="coach-mini-board">
      <Board
        fen={drawing.fen}
        orientation={orientation}
        turnColor={game.turn()}
        dests={NO_MOVES}
        check={false}
        isPromotion={() => false}
        onMove={() => {}}
        drawing={drawing}
      />
    </div>
  )
}

function tokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
