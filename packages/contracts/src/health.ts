import { createRoute, z } from '@hono/zod-openapi'

export const HealthSchema = z
  .object({
    status: z.literal('ok'),
    service: z.string().openapi({ example: 'chessy-api' }),
    version: z.string().openapi({ example: '0.1.0' }),
    uptimeSeconds: z.number().int().nonnegative(),
  })
  .openapi('Health')

export type Health = z.infer<typeof HealthSchema>

export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['system'],
  summary: 'Liveness check',
  responses: {
    200: {
      description: 'The API is up',
      content: { 'application/json': { schema: HealthSchema } },
    },
  },
})
