import { describe, expect, it } from 'vitest'
import { loadConfig } from '../../config'
import { applyCoachUpdate, coachView, effectiveCoach, maskKey } from './coachSettings'

const KEY = 'sk-ant-api03-abcdefghijklmnop-a1b2'

describe('coach settings', () => {
  it('shows keys only as a hint, with where they come from', () => {
    const fromEnv = coachView(loadConfig({ ANTHROPIC_API_KEY: KEY }))
    expect(fromEnv.claudeApi.apiKey).toEqual({ set: true, hint: 'sk-ant-…a1b2', source: 'env' })
    expect(JSON.stringify(fromEnv)).not.toContain('abcdefghijklmnop')

    const fromPage = coachView(loadConfig({ ANTHROPIC_API_KEY: KEY }), {
      claudeApi: { apiKey: 'sk-ant-page-key-0000-zzzz' },
    })
    expect(fromPage.claudeApi.apiKey).toEqual({
      set: true,
      hint: 'sk-ant-…zzzz',
      source: 'settings',
    })
    expect(coachView(loadConfig({})).claudeApi.apiKey).toEqual({ set: false })
  })

  it('lets the settings page win over .env, field by field', () => {
    const coach = effectiveCoach(
      loadConfig({ COACH_OLLAMA: 'on', COACH_OLLAMA_MODEL: 'llama3.1:8b' }),
      {
        ollama: { model: 'qwen3:14b' },
        claudeApi: { effort: 'high' },
      },
    )
    expect(coach.ollama).toEqual({
      enabled: true,
      url: 'http://localhost:11434/v1',
      model: 'qwen3:14b',
    })
    expect(coach.claudeApi).toMatchObject({
      enabled: true,
      model: 'claude-opus-5-5',
      effort: 'high',
    })
  })

  it('applies an update: left out stays, a new key replaces, null removes it', () => {
    const stored = { claudeApi: { apiKey: KEY, effort: 'low' as const }, ollama: { enabled: true } }
    expect(applyCoachUpdate(stored, { claudeApi: { model: 'claude-sonnet-5-5' } })).toEqual({
      claudeApi: { apiKey: KEY, effort: 'low', model: 'claude-sonnet-5-5' },
      ollama: { enabled: true },
    })
    expect(
      applyCoachUpdate(stored, { claudeApi: { apiKey: 'sk-new-key-123456' } }).claudeApi?.apiKey,
    ).toBe('sk-new-key-123456')
    expect(applyCoachUpdate(stored, { claudeApi: { apiKey: null } }).claudeApi).toEqual({
      effort: 'low',
    })
    expect(applyCoachUpdate(stored, { defaultAgent: 'ollama' }).defaultAgent).toBe('ollama')
    expect(stored.claudeApi.apiKey).toBe(KEY) // not changed in place
  })

  it('masks short keys entirely', () => {
    expect(maskKey('short-key')).toBe('••••ey')
  })
})
