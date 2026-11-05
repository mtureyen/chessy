import type { CoachAgentsBody, CoachSettingsBody, CoachSettingsUpdateBody } from '@chessy/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useServices } from '@/app/servicesContext'
import { KeyField, type KeyChange } from './KeyField'

type AgentStatus = CoachAgentsBody['agents'][number]
type Save = (update: CoachSettingsUpdateBody) => void

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

/** The coach's providers: on/off, keys, models, and whether each can answer right now. */
export function CoachSettings() {
  const { settings } = useServices()
  const queryClient = useQueryClient()
  const view = useQuery({ queryKey: ['coach-settings'], queryFn: settings.coach, retry: false })
  const agents = useQuery({ queryKey: ['coach-agents'], queryFn: settings.agents })
  const save = useMutation({
    mutationFn: settings.updateCoach,
    onSuccess: (next) => {
      queryClient.setQueryData(['coach-settings'], next)
      void queryClient.invalidateQueries({ queryKey: ['coach-agents'] })
    },
  })

  if (view.isPending) return <p className="message message-info">Loading…</p>
  if (view.isError) {
    return (
      <p className="message message-error" role="alert">
        The coach's settings can't be loaded: {view.error.message}
      </p>
    )
  }
  const v = view.data
  const statusOf = (id: string) => agents.data?.find((agent) => agent.id === id)
  const props = { save: save.mutate, saving: save.isPending }

  return (
    <div className="coach-settings">
      <p className="settings-intro">
        The coach answers with one of these. Keys stay on this computer (apps/api/.chessy) and are
        never shown again once saved.
      </p>
      <DefaultCoach view={v} agents={agents.data ?? []} {...props} />

      <Provider
        id="claude-api"
        title="Claude (API)"
        about="Claude through Anthropic's API, paid per question (a few cents each)."
        enabled={v.claudeApi.enabled}
        status={statusOf('claude-api')}
        onToggle={(enabled) => save.mutate({ claudeApi: { enabled } })}
      >
        <ClaudeApiFields view={v.claudeApi} {...props} />
      </Provider>

      <Provider
        id="claude-headless"
        title="Claude Code (subscription)"
        about="Runs on your Claude subscription through Claude Code (installed and logged in). No extra cost."
        enabled={v.claudeHeadless.enabled}
        status={statusOf('claude-headless')}
        onToggle={(enabled) => save.mutate({ claudeHeadless: { enabled } })}
      >
        <HeadlessFields view={v.claudeHeadless} {...props} />
      </Provider>

      <Provider
        id="ollama"
        title="Ollama (local)"
        about="A model on this computer: free and private, slower and weaker than Claude."
        enabled={v.ollama.enabled}
        status={statusOf('ollama')}
        onToggle={(enabled) => save.mutate({ ollama: { enabled } })}
      >
        <OllamaFields view={v.ollama} {...props} />
      </Provider>

      <Provider
        id="openai-compatible"
        title="OpenAI-compatible"
        about="Any other provider with an OpenAI-style API: OpenAI, OpenRouter, Groq, LM Studio, …"
        enabled={v.openAiCompatible.enabled}
        status={statusOf('openai-compatible')}
        readyText="✓ Reachable, model found (the key is checked with the first question)"
        onToggle={(enabled) => save.mutate({ openAiCompatible: { enabled } })}
      >
        <OpenAiFields view={v.openAiCompatible} {...props} />
      </Provider>

      {save.isError && (
        <p className="message message-error" role="alert">
          Not saved: {save.error.message}
        </p>
      )}
      <button type="button" className="settings-recheck" onClick={() => void agents.refetch()}>
        {agents.isFetching ? 'Checking…' : 'Check again'}
      </button>
    </div>
  )
}

function DefaultCoach({
  view,
  agents,
  save,
}: {
  view: CoachSettingsBody
  agents: AgentStatus[]
  save: Save
}) {
  return (
    <div className="settings-field settings-default">
      <label className="settings-label" htmlFor="default-coach">
        Default coach
      </label>
      <select
        id="default-coach"
        value={view.defaultAgent ?? ''}
        onChange={(e) =>
          save({ defaultAgent: (e.target.value || null) as CoachSettingsBody['defaultAgent'] })
        }
      >
        <option value="">The first one that's ready</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function Provider({
  id,
  title,
  about,
  enabled,
  status,
  readyText = '✓ Ready',
  onToggle,
  children,
}: {
  id: string
  title: string
  about: string
  enabled: boolean
  status: AgentStatus | undefined
  /** What "available" means for it, e.g. that a key is only checked on the first question. */
  readyText?: string
  onToggle: (enabled: boolean) => void
  children: ReactNode
}) {
  return (
    <section className={`provider${enabled ? '' : ' provider-off'}`} data-testid={`provider-${id}`}>
      <header className="provider-head">
        <div>
          <h3>{title}</h3>
          <p className="settings-note">{about}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${title}: ${enabled ? 'on' : 'off'}`}
          className="switch"
          onClick={() => onToggle(!enabled)}
        >
          <span />
        </button>
      </header>
      {enabled && (
        <p
          className={`provider-status ${!status ? '' : status.available ? 'provider-ready' : 'provider-problem'}`}
          role="status"
        >
          {status ? (status.available ? readyText : status.reason) : 'Checking…'}
        </p>
      )}
      {enabled && children}
    </section>
  )
}

/** A labelled text input. */
function TextField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <div className="settings-field">
      <label className="settings-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function SaveButton({
  dirty,
  saving,
  onSave,
}: {
  dirty: boolean
  saving: boolean
  onSave: () => void
}) {
  return (
    <button type="button" className="settings-save" disabled={!dirty || saving} onClick={onSave}>
      {saving ? 'Saving…' : 'Save'}
    </button>
  )
}

function ClaudeApiFields({
  view,
  save,
  saving,
}: {
  view: CoachSettingsBody['claudeApi']
  save: Save
  saving: boolean
}) {
  const [key, setKey] = useState<KeyChange>()
  const [model, setModel] = useState(view.model)
  const [effort, setEffort] = useState(view.effort)
  const dirty = key !== undefined || model !== view.model || effort !== view.effort
  return (
    <div className="provider-fields">
      <KeyField id="claude-key" label="API key" view={view.apiKey} value={key} onChange={setKey} />
      <TextField id="claude-model" label="Model" value={model} onChange={setModel} />
      <div className="settings-field">
        <label className="settings-label" htmlFor="claude-effort">
          Effort
        </label>
        <select
          id="claude-effort"
          value={effort}
          onChange={(e) => setEffort(e.target.value as typeof effort)}
        >
          {EFFORTS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
        <span className="settings-note">More thinks longer and costs more per answer.</span>
      </div>
      <SaveButton
        dirty={dirty && key !== ''}
        saving={saving}
        onSave={() => {
          save({ claudeApi: { model, effort, ...(key !== undefined && { apiKey: key }) } })
          setKey(undefined)
        }}
      />
    </div>
  )
}

function HeadlessFields({
  view,
  save,
  saving,
}: {
  view: CoachSettingsBody['claudeHeadless']
  save: Save
  saving: boolean
}) {
  const [model, setModel] = useState(view.model ?? '')
  return (
    <div className="provider-fields">
      <TextField
        id="headless-model"
        label="Model"
        value={model}
        placeholder="Claude Code's default (e.g. opus, sonnet)"
        onChange={setModel}
      />
      <SaveButton
        dirty={model !== (view.model ?? '')}
        saving={saving}
        onSave={() => save({ claudeHeadless: { model: model.trim() || null } })}
      />
    </div>
  )
}

function OllamaFields({
  view,
  save,
  saving,
}: {
  view: CoachSettingsBody['ollama']
  save: Save
  saving: boolean
}) {
  const [url, setUrl] = useState(view.url)
  const [model, setModel] = useState(view.model)
  return (
    <div className="provider-fields">
      <TextField id="ollama-url" label="URL" value={url} onChange={setUrl} />
      <TextField id="ollama-model" label="Model" value={model} onChange={setModel} />
      <p className="settings-note">
        Start Ollama with <code>OLLAMA_CONTEXT_LENGTH=16384 ollama serve</code>: its default context
        is too short for longer conversations, and it cuts them off without telling.
      </p>
      <SaveButton
        dirty={url !== view.url || model !== view.model}
        saving={saving}
        onSave={() => save({ ollama: { url, model } })}
      />
    </div>
  )
}

function OpenAiFields({
  view,
  save,
  saving,
}: {
  view: CoachSettingsBody['openAiCompatible']
  save: Save
  saving: boolean
}) {
  const [url, setUrl] = useState(view.url ?? '')
  const [model, setModel] = useState(view.model ?? '')
  const [label, setLabel] = useState(view.label ?? '')
  const [key, setKey] = useState<KeyChange>()
  const dirty =
    key !== undefined ||
    url !== (view.url ?? '') ||
    model !== (view.model ?? '') ||
    label !== (view.label ?? '')
  return (
    <div className="provider-fields">
      <TextField
        id="openai-url"
        label="URL"
        value={url}
        placeholder="https://openrouter.ai/api/v1"
        onChange={setUrl}
      />
      <TextField
        id="openai-model"
        label="Model"
        value={model}
        placeholder="e.g. deepseek/deepseek-chat"
        onChange={setModel}
      />
      <TextField
        id="openai-label"
        label="Name"
        value={label}
        placeholder="Shown when picking the coach"
        onChange={setLabel}
      />
      <KeyField id="openai-key" label="API key" view={view.apiKey} value={key} onChange={setKey} />
      <SaveButton
        dirty={dirty && key !== ''}
        saving={saving}
        onSave={() => {
          save({
            openAiCompatible: {
              url: url.trim() || null,
              model: model.trim() || null,
              label: label.trim() || null,
              ...(key !== undefined && { apiKey: key }),
            },
          })
          setKey(undefined)
        }}
      />
    </div>
  )
}
