import { createApiClient, type ApiClient } from '@/adapters/api/client'

/** Everything the UI talks to the outside world through. Ports get added here per phase. */
export interface Services {
  api: ApiClient
}

/** Composition root: the only place that decides which adapter fills which port. */
export function createServices(): Services {
  return {
    api: createApiClient(window.location.origin),
  }
}
