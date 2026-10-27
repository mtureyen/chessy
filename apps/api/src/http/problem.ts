import type { Problem } from '@chessy/contracts'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

/**
 * Responds with an RFC 7807 problem document. Generic over the status so typed routes
 * can check it against the error responses their contract declares.
 */
export function problem<S extends ContentfulStatusCode>(
  c: Context,
  status: S,
  title: string,
  extra: Omit<Problem, 'type' | 'title' | 'status'> = {},
) {
  const body: Problem = { type: 'about:blank', title, status, instance: c.req.path, ...extra }
  return c.json(body, status, { 'Content-Type': 'application/problem+json' })
}
