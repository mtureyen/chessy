import { describe, expect, it } from 'vitest'
import { loadConfig } from '../../config'
import { coachConfig, createCoachAgents } from './agents'

describe('coach agents', () => {
  it('offers Claude by default, Ollama and another OpenAI-compatible API when configured', () => {
    expect(createCoachAgents(coachConfig(loadConfig({})), []).map((a) => a.id)).toEqual([
      'claude-api',
    ])
    const all = createCoachAgents(
      coachConfig(
        loadConfig({
          COACH_OLLAMA: 'on',
          COACH_OPENAI_URL: 'https://openrouter.ai/api/v1',
          COACH_OPENAI_MODEL: 'deepseek/deepseek-chat',
          COACH_OPENAI_KEY: 'sk-or-test',
        }),
      ),
      [],
    )
    expect(all.map((a) => [a.id, a.label])).toEqual([
      ['claude-api', 'Claude Opus 5.5 (API)'],
      ['ollama', 'qwen3:14b (Ollama, local)'],
      ['openai-compatible', 'deepseek/deepseek-chat'],
    ])
  })

  it('leaves an OpenAI-compatible API out without a model, and Claude when switched off', () => {
    const agents = createCoachAgents(
      coachConfig(
        loadConfig({ COACH_CLAUDE_API: 'off', COACH_OPENAI_URL: 'https://api.openai.com/v1' }),
      ),
      [],
    )
    expect(agents).toEqual([])
  })
})
