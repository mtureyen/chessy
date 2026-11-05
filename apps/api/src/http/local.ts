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
 * Turns away requests addressed to another name than this machine's: a web page that points its
 * own domain at 127.0.0.1 (DNS rebinding) would otherwise talk to the API from the user's
 * browser. For an API that listens on localhost only.
 */
export function onlyLocalHostNames(): MiddlewareHandler {
  return async (c, next) => {
    if (!LOOPBACK_HOSTS.has(hostName(c))) {
      return problem(c, 403, 'Forbidden', { detail: 'This API only answers on localhost' })
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
    if (!LOOPBACK_HOSTS.has(hostName(c)) || (address && !isLoopbackAddress(address))) {
      return problem(c, 403, 'Forbidden', { detail: 'Only from this machine' })
    }
    await next()
  }
}
