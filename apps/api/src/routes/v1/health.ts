import { healthRoute } from '@chessy/contracts'
import { createRouter } from '../../http/router'

export interface HealthDeps {
  version: string
  startedAt: number
  now: () => number
}

export function healthRoutes({ version, startedAt, now }: HealthDeps) {
  return createRouter().openapi(healthRoute, (c) =>
    c.json(
      {
        status: 'ok' as const,
        service: 'chessy-api',
        version,
        uptimeSeconds: Math.floor((now() - startedAt) / 1000),
      },
      200,
    ),
  )
}
