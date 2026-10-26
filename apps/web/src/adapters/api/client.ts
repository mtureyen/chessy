import type { AppType } from '@chessy/api/rpc'
import { hc } from 'hono/client'

/** Typed HTTP client generated from the API's route types. */
export function createApiClient(baseUrl: string) {
  return hc<AppType>(baseUrl)
}

export type ApiClient = ReturnType<typeof createApiClient>
