import { OpenAPIHono } from '@hono/zod-openapi'
import { problem } from './problem'

/** A router whose contract validation failures answer with a 400 problem document. */
export function createRouter() {
  return new OpenAPIHono({
    defaultHook: (result, c) => {
      if (result.success) return
      return problem(c, 400, 'Validation failed', {
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    },
  })
}
