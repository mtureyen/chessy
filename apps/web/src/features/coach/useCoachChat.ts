import {
  applyEvent,
  placed,
  type ChatMessage,
  type CoachContext,
  type CoachMessage,
  type PlacedDrawing,
} from './messages'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useServices } from '@/app/servicesContext'

/**
 * A conversation with the coach: the agents to choose from, the messages, and asking (one
 * question at a time, answered as it is written). Drawings go to `onDrawing` as they arrive.
 */
export function useCoachChat({ onDrawing }: { onDrawing: (drawing: PlacedDrawing) => void }) {
  const { coach } = useServices()
  const agents = useQuery({ queryKey: ['coach-agents'], queryFn: coach.agents, retry: false })
  const [chosen, setChosen] = useState<string>()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const conversation = useRef(crypto.randomUUID())
  const running = useRef<AbortController | undefined>(undefined)
  const drawingListener = useRef(onDrawing)
  useEffect(() => {
    drawingListener.current = onDrawing
  })

  const available = agents.data?.filter((agent) => agent.available) ?? []
  const agent = available.find((a) => a.id === chosen) ?? available[0]
  const answering = messages.some((m) => m.role === 'coach' && m.status === 'answering')

  const reset = useCallback(() => {
    running.current?.abort()
    conversation.current = crypto.randomUUID()
    setMessages([])
  }, [])

  /** Another agent starts a new conversation (each keeps its own history). */
  const choose = useCallback(
    (id: string) => {
      if (id === agent?.id) return
      reset()
      setChosen(id)
    },
    [agent?.id, reset],
  )

  const ask = useCallback(
    async (question: string, context: CoachContext) => {
      if (!agent || running.current) return
      const replyId = crypto.randomUUID()
      setMessages((list) => [
        ...list,
        { id: crypto.randomUUID(), role: 'user', text: question },
        { id: replyId, role: 'coach', text: '', tools: [], drawings: [], status: 'answering' },
      ])
      const update = (change: (reply: CoachMessage) => CoachMessage) =>
        setMessages((list) =>
          list.map((m) => (m.id === replyId && m.role === 'coach' ? change(m) : m)),
        )
      const abort = new AbortController()
      running.current = abort
      try {
        await coach.ask(
          { agent: agent.id, conversationId: conversation.current, question, context },
          (event) => {
            const drawing = event.type === 'board' && placed(event.drawing, context)
            if (drawing) drawingListener.current(drawing)
            update((reply) => applyEvent(reply, event, drawing || undefined))
          },
          abort.signal,
        )
        // A stream that ends without "done" or "error" was cut off.
        update((reply) =>
          reply.status === 'answering'
            ? { ...reply, status: 'failed', error: 'The answer stopped unexpectedly.' }
            : reply,
        )
      } catch (error) {
        update((reply) =>
          abort.signal.aborted
            ? { ...reply, status: 'stopped' }
            : { ...reply, status: 'failed', error: messageOf(error) },
        )
      } finally {
        if (running.current === abort) running.current = undefined
      }
    },
    [agent, coach],
  )

  const stop = useCallback(() => running.current?.abort(), [])

  useEffect(() => () => running.current?.abort(), [])

  return { agents, agent, choose, messages, answering, ask, stop, reset }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export type {
  ChatMessage,
  CoachContext,
  CoachMessage,
  PlacedDrawing,
  UserMessage,
} from './messages'
