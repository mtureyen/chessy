import { z } from '@hono/zod-openapi'

/** Error body for every non-2xx response (RFC 7807, `application/problem+json`). */
export const ProblemSchema = z
  .object({
    type: z.string().openapi({ example: 'about:blank' }),
    title: z.string().openapi({ example: 'Not Found' }),
    status: z.number().int().openapi({ example: 404 }),
    detail: z.string().optional(),
    instance: z.string().optional(),
    errors: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional()
      .openapi({ description: 'Field-level validation errors' }),
  })
  .openapi('Problem')

export type Problem = z.infer<typeof ProblemSchema>
