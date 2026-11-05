import { createRoute, z } from '@hono/zod-openapi'
import { ProblemSchema } from './problem'

export const COACH_AGENT_IDS = [
  'claude-api',
  'claude-headless',
  'ollama',
  'openai-compatible',
] as const
export const CoachAgentIdSchema = z.enum(COACH_AGENT_IDS)
export const EffortSchema = z.enum(['low', 'medium', 'high', 'xhigh', 'max'])

/** A stored API key as the settings page sees it: never the key itself. */
const KeyViewSchema = z.object({
  set: z.boolean(),
  /** e.g. "sk-ant-…a1b2". */
  hint: z.string().optional(),
  /** Entered on the settings page, or from apps/api/.env. */
  source: z.enum(['settings', 'env']).optional(),
})

export const CoachSettingsSchema = z
  .object({
    /** The agent that answers when the user doesn't pick one; null: the first available. */
    defaultAgent: CoachAgentIdSchema.nullable(),
    claudeApi: z.object({
      enabled: z.boolean(),
      model: z.string(),
      effort: EffortSchema,
      apiKey: KeyViewSchema,
    }),
    claudeHeadless: z.object({ enabled: z.boolean(), model: z.string().nullable() }),
    ollama: z.object({ enabled: z.boolean(), url: z.string(), model: z.string() }),
    openAiCompatible: z.object({
      enabled: z.boolean(),
      url: z.string().nullable(),
      model: z.string().nullable(),
      label: z.string().nullable(),
      apiKey: KeyViewSchema,
    }),
  })
  .openapi('CoachSettings')

export type CoachSettingsBody = z.infer<typeof CoachSettingsSchema>

/** A key field in an update: a new key, null to remove it, left out to keep it. */
const KeyUpdate = z.string().trim().min(8).max(500).nullable().optional()
const Name = z.string().trim().min(1).max(200)

export const CoachSettingsUpdateSchema = z
  .object({
    defaultAgent: CoachAgentIdSchema.nullable().optional(),
    claudeApi: z
      .object({
        enabled: z.boolean().optional(),
        model: Name.optional(),
        effort: EffortSchema.optional(),
        apiKey: KeyUpdate,
      })
      .optional(),
    claudeHeadless: z
      .object({ enabled: z.boolean().optional(), model: Name.nullable().optional() })
      .optional(),
    ollama: z
      .object({
        enabled: z.boolean().optional(),
        url: z.string().url().optional(),
        model: Name.optional(),
      })
      .optional(),
    openAiCompatible: z
      .object({
        enabled: z.boolean().optional(),
        url: z.string().url().nullable().optional(),
        model: Name.nullable().optional(),
        label: Name.nullable().optional(),
        apiKey: KeyUpdate,
      })
      .optional(),
  })
  .openapi('CoachSettingsUpdate')

export type CoachSettingsUpdateBody = z.infer<typeof CoachSettingsUpdateSchema>

const problem = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: ProblemSchema } },
})

export const coachSettingsRoute = createRoute({
  method: 'get',
  path: '/settings/coach',
  tags: ['settings'],
  summary: "The coach's providers as configured (API keys only as a hint)",
  description: 'Only from this machine.',
  responses: {
    200: {
      description: 'Settings',
      content: { 'application/json': { schema: CoachSettingsSchema } },
    },
    403: problem('Not from this machine'),
  },
})

export const updateCoachSettingsRoute = createRoute({
  method: 'put',
  path: '/settings/coach',
  tags: ['settings'],
  summary: "Changes the coach's providers; the agents follow at once",
  description:
    'Fields left out stay as they are; an API key set to null is removed. Kept in apps/api/.chessy/settings.json, over apps/api/.env. Only from this machine.',
  request: {
    body: {
      content: { 'application/json': { schema: CoachSettingsUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'The settings now',
      content: { 'application/json': { schema: CoachSettingsSchema } },
    },
    400: problem('Invalid settings'),
    403: problem('Not from this machine'),
  },
})
