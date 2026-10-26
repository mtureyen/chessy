import { API_V1_PREFIX } from '@chessy/contracts'
import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { problem } from './http/problem'
import { createRouter } from './http/router'
import { healthRoutes } from './routes/v1/health'

export interface AppDeps {
  version: string
  startedAt: number
  now?: () => number
}

/** Builds the HTTP app from its dependencies. main.ts wires real ones, tests wire fakes. */
export function createApp({ version, startedAt, now = Date.now }: AppDeps) {
  const v1 = createRouter().route('/', healthRoutes({ version, startedAt, now }))

  v1.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Chessy API', version },
    servers: [{ url: API_V1_PREFIX }],
  })
  v1.get('/docs', Scalar({ url: `${API_V1_PREFIX}/openapi.json`, pageTitle: 'Chessy API' }))

  const app = new OpenAPIHono().route(API_V1_PREFIX, v1)
  app.notFound((c) =>
    problem(c, 404, 'Not Found', { detail: `No route for ${c.req.method} ${c.req.path}` }),
  )
  app.onError((err, c) => {
    console.error(err)
    return problem(c, 500, 'Internal Server Error')
  })
  return app
}

export type AppType = ReturnType<typeof createApp>
