import type { Context, MiddlewareHandler } from 'hono'
import { problem } from './problem'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** The Host header's name without the port, e.g. "localhost" for "localhost:5173". */
function hostName(c: Context): string {
  const host = c.req.header('host') ?? ''
  return host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0]!
}

/** Where the request comes from, as Bun's server reports it (undefined outside Bun, e.g. tests). */
function remoteAddress(c: Context): string | undefined {
  const server = c.env as
    { requestIP?: (request: Request) => { address: string } | null } | undefined
  return server?.requestIP?.(c.req.raw)?.address
}

function isLoopbackAddress(address: string): boolean {
  return address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.')
}

/**
 * Whether a request comes from a page of another site. Browsers name the page's origin on every
 * request that could change something (and on cross-origin reads); the app's own pages are
 * served from this machine. Requests without an origin aren't from a page at all: the app's
 * proxy, a script, the coach's tools.
 */
function fromAnotherSite(c: Context): boolean {
  const origin = c.req.header('origin')
  if (origin === undefined) return false
  try {
    return !LOOPBACK_HOSTS.has(new URL(origin).hostname)
  } catch {
    // "null" (a sandboxed page, a file) or anything else that is no address.
    return true
  }
}

/**
 * Turns away requests that don't belong to this machine's own pages. One addressed to another
 * name: a web page that points its own domain at 127.0.0.1 (DNS rebinding) would otherwise talk
 * to the API from the user's browser. And one sent by a page of another site: it couldn't read
 * the answer, but it could start work here (an engine run, a pause of the reviews). For an API
 * that listens on localhost only.
 */
export function onlyLocalHostNames(): MiddlewareHandler {
  return async (c, next) => {
    if (!LOOPBACK_HOSTS.has(hostName(c))) {
      return problem(c, 403, 'Forbidden', { detail: 'This API only answers on localhost' })
    }
    if (fromAnotherSite(c)) {
      return problem(c, 403, 'Forbidden', { detail: 'This API only answers its own pages' })
    }
    await next()
  }
}

/**
 * For what only the user at this machine may do (settings, API keys): a loopback Host header
 * and, where the server can tell, a loopback client, also when the API listens on the network.
 */
export function onlyThisMachine(): MiddlewareHandler {
  return async (c, next) => {
    const address = remoteAddress(c)
    if (
      !LOOPBACK_HOSTS.has(hostName(c)) ||
      (address && !isLoopbackAddress(address)) ||
      fromAnotherSite(c)
    ) {
      return problem(c, 403, 'Forbidden', { detail: 'Only from this machine' })
    }
    await next()
  }
}
