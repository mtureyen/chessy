import type { Problem } from '@chessy/contracts'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** Responds with an RFC 7807 problem document. */
export function problem(
  c: Context,
  status: ContentfulStatusCode,
  title: string,
  extra: Omit<Problem, 'type' | 'title' | 'status'> = {},
) {
  const body: Problem = { type: 'about:blank', title, status, instance: c.req.path, ...extra }
  return c.json(body, status, { 'Content-Type': 'application/problem+json' })
}
