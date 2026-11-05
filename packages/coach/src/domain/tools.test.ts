import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { InMemoryConversationStore } from '../adapters/inMemoryConversationStore'
import { defineTool } from './tools'

describe('defineTool', () => {
  const tool = defineTool({
    name: 'evaluate',
    description: 'Evaluates a position.',
    input: z.object({
      fen: z.string().describe('The position'),
      lines: z.number().int().max(5).optional(),
      depth: z.number().int().default(20),
    }),
    run: async ({ fen }) => ({ content: fen }),
  })

  it('describes its input as a JSON Schema for any provider', () => {
    expect(tool.inputSchema).toMatchObject({
      type: 'object',
      properties: { fen: { type: 'string', description: 'The position' } },
      required: ['fen'], // a field with a default is optional for the model
    })
    expect(tool.inputSchema).not.toHaveProperty('$schema')
  })

  it('checks inputs before they are run', () => {
    expect(tool.parse({ fen: 'x', lines: 3 })).toEqual({
      ok: true,
      value: { fen: 'x', lines: 3, depth: 20 },
    })
    const bad = tool.parse({ lines: 9 })
    expect(bad.ok).toBe(false)
  })
})

describe('InMemoryConversationStore', () => {
  it('keeps copies and drops the least recently used beyond its limit', async () => {
    const store = new InMemoryConversationStore(2)
    await store.save('a', [{ role: 'user', text: 'a' }])
    await store.save('b', [{ role: 'user', text: 'b' }])
    await store.load('a') // a is used again; b is now the oldest
    await store.save('c', [{ role: 'user', text: 'c' }])
    expect(await store.load('b')).toBeUndefined()
    const a = (await store.load('a'))!
    a.push({ role: 'user', text: 'changed' })
    expect(await store.load('a')).toHaveLength(1)
  })
})
