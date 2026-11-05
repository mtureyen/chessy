import type { CoachSettingsBody, CoachSettingsUpdateBody } from '@chessy/contracts'
import type { Config } from '../../config'

type Effort = CoachSettingsBody['claudeApi']['effort']
type AgentId = NonNullable<CoachSettingsBody['defaultAgent']>

/** What the settings page has set; anything missing falls back to apps/api/.env. */
export interface StoredCoachSettings {
  defaultAgent?: AgentId | null
  claudeApi?: { enabled?: boolean; model?: string; effort?: Effort; apiKey?: string }
  claudeHeadless?: { enabled?: boolean; model?: string | null }
  ollama?: { enabled?: boolean; url?: string; model?: string }
  openAiCompatible?: {
    enabled?: boolean
    url?: string | null
    model?: string | null
    label?: string | null
    apiKey?: string
  }
}

/** The coach as configured: the settings page over apps/api/.env. Keys included. */
export interface EffectiveCoach {
  defaultAgent: AgentId | null
  claudeApi: { enabled: boolean; model: string; label: string; effort: Effort; apiKey?: string }
  claudeHeadless: { enabled: boolean; command: string; model?: string }
  ollama: { enabled: boolean; url: string; model: string }
  openAiCompatible: {
    enabled: boolean
    url?: string
    model?: string
    label?: string
    apiKey?: string
  }
}

export function effectiveCoach(config: Config, stored: StoredCoachSettings = {}): EffectiveCoach {
  const { claudeApi = {}, claudeHeadless = {}, ollama = {}, openAiCompatible = {} } = stored
  const apiKey = claudeApi.apiKey ?? config.ANTHROPIC_API_KEY
  const openAiKey = openAiCompatible.apiKey ?? config.COACH_OPENAI_KEY
  const url = defined(openAiCompatible.url, config.COACH_OPENAI_URL)
  const model = defined(openAiCompatible.model, config.COACH_OPENAI_MODEL)
  const label = defined(openAiCompatible.label, config.COACH_OPENAI_LABEL)
  const headlessModel = defined(claudeHeadless.model, config.COACH_CLAUDE_HEADLESS_MODEL)
  return {
    defaultAgent: stored.defaultAgent ?? null,
    claudeApi: {
      enabled: claudeApi.enabled ?? config.COACH_CLAUDE_API === 'on',
      model: claudeApi.model ?? config.COACH_CLAUDE_MODEL,
      label: config.COACH_CLAUDE_LABEL,
      effort: claudeApi.effort ?? config.COACH_CLAUDE_EFFORT,
      ...(apiKey && { apiKey }),
    },
    claudeHeadless: {
      enabled: claudeHeadless.enabled ?? config.COACH_CLAUDE_HEADLESS === 'on',
      command: config.COACH_CLAUDE_COMMAND,
      ...(headlessModel && { model: headlessModel }),
    },
    ollama: {
      enabled: ollama.enabled ?? config.COACH_OLLAMA === 'on',
      url: ollama.url ?? config.COACH_OLLAMA_URL,
      model: ollama.model ?? config.COACH_OLLAMA_MODEL,
    },
    openAiCompatible: {
      enabled: openAiCompatible.enabled ?? url !== undefined,
      ...(url && { url }),
      ...(model && { model }),
      ...(label && { label }),
      ...(openAiKey && { apiKey: openAiKey }),
    },
  }
}

/** The settings as the page sees them: API keys only as a hint and where they come from. */
export function coachView(config: Config, stored: StoredCoachSettings = {}): CoachSettingsBody {
  const coach = effectiveCoach(config, stored)
  const keyView = (fromSettings: string | undefined, fromEnv: string | undefined) => {
    const key = fromSettings ?? fromEnv
    return key
      ? {
          set: true,
          hint: maskKey(key),
          source: fromSettings ? ('settings' as const) : ('env' as const),
        }
      : { set: false }
  }
  return {
    defaultAgent: coach.defaultAgent,
    claudeApi: {
      enabled: coach.claudeApi.enabled,
      model: coach.claudeApi.model,
      effort: coach.claudeApi.effort,
      apiKey: keyView(stored.claudeApi?.apiKey, config.ANTHROPIC_API_KEY),
    },
    claudeHeadless: {
      enabled: coach.claudeHeadless.enabled,
      model: coach.claudeHeadless.model ?? null,
    },
    ollama: coach.ollama,
    openAiCompatible: {
      enabled: coach.openAiCompatible.enabled,
      url: coach.openAiCompatible.url ?? null,
      model: coach.openAiCompatible.model ?? null,
      label: coach.openAiCompatible.label ?? null,
      apiKey: keyView(stored.openAiCompatible?.apiKey, config.COACH_OPENAI_KEY),
    },
  }
}

/**
 * The stored settings with an update applied: fields left out stay, null clears a field (an
 * API key: removed from the settings, so .env's applies again, if any).
 */
export function applyCoachUpdate(
  stored: StoredCoachSettings,
  update: CoachSettingsUpdateBody,
): StoredCoachSettings {
  const next: StoredCoachSettings = structuredClone(stored)
  if (update.defaultAgent !== undefined) next.defaultAgent = update.defaultAgent
  for (const section of ['claudeApi', 'claudeHeadless', 'ollama', 'openAiCompatible'] as const) {
    const changes = update[section]
    if (!changes) continue
    const merged: Record<string, unknown> = { ...next[section] }
    for (const [field, value] of Object.entries(changes)) {
      if (value === undefined) continue
      if (value === null && field === 'apiKey') delete merged[field]
      else merged[field] = value
    }
    Object.assign(next, { [section]: merged })
  }
  return next
}

/** "sk-ant-api03-…a1b2": enough to recognise a key, not to use it. */
export function maskKey(key: string): string {
  return key.length < 16 ? `••••${key.slice(-2)}` : `${key.slice(0, 7)}…${key.slice(-4)}`
}

/** The settings page's value if it set one (null: cleared there), else .env's. */
function defined<T>(fromSettings: T | null | undefined, fromEnv: T | undefined): T | undefined {
  if (fromSettings === null) return undefined
  return fromSettings ?? fromEnv
}
