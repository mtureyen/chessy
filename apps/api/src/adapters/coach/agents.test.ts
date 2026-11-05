import { describe, expect, it } from 'vitest'
import { loadConfig } from '../../config'
import { effectiveCoach } from '../settings/coachSettings'
import { CoachRegistry, createCoachAgents } from './agents'

const server = { baseUrl: 'http://127.0.0.1:3000', version: 'test' }
const ids = (env: Record<string, string>, stored = {}) =>
  createCoachAgents(effectiveCoach(loadConfig(env), stored), [], server).map((a) => a.id)

describe('coach agents', () => {
  it('offers both Claude agents by default, Ollama and another API when configured', () => {
    expect(ids({})).toEqual(['claude-api', 'claude-headless'])
    const all = createCoachAgents(
      effectiveCoach(
        loadConfig({
          COACH_OLLAMA: 'on',
          COACH_OPENAI_URL: 'https://openrouter.ai/api/v1',
          COACH_OPENAI_MODEL: 'deepseek/deepseek-chat',
        }),
      ),
      [],
      server,
    )
    expect(all.map((a) => [a.id, a.label])).toEqual([
      ['claude-api', 'Claude Opus 5.5 (API)'],
      ['claude-headless', 'Claude Code (your subscription)'],
      ['ollama', 'qwen3:14b (Ollama, local)'],
      ['openai-compatible', 'deepseek/deepseek-chat'],
    ])
  })

  it('follows the settings page over .env, and leaves an API without a model out', () => {
    expect(
      ids(
        { COACH_OLLAMA: 'on' },
        { ollama: { enabled: false }, claudeHeadless: { enabled: false } },
      ),
    ).toEqual(['claude-api'])
    expect(
      ids(
        {},
        {
          claudeApi: { enabled: false },
          claudeHeadless: { enabled: false },
          openAiCompatible: { enabled: true, url: 'https://api.openai.com/v1' },
        },
      ),
    ).toEqual([])
  })

  it('puts the default agent first and rebuilds the agents when told', () => {
    const registry = new CoachRegistry([], server)
    registry.configure(effectiveCoach(loadConfig({}), { defaultAgent: 'claude-headless' }))
    expect(registry.agents().map((a) => a.id)).toEqual(['claude-headless', 'claude-api'])
    registry.configure(effectiveCoach(loadConfig({}), { claudeApi: { enabled: false } }))
    expect(registry.agents().map((a) => a.id)).toEqual(['claude-headless'])
  })
})
