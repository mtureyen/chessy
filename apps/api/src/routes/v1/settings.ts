import { coachSettingsRoute, updateCoachSettingsRoute } from '@chessy/contracts'
import type { SettingsService } from '../../adapters/settings/settingsService'
import { onlyThisMachine } from '../../http/local'
import { createRouter } from '../../http/router'

/** The settings page's routes: only from this machine, as they hold API keys. */
export function settingsRoutes({ settings }: { settings: SettingsService }) {
  const router = createRouter()
  router.use('/settings/*', onlyThisMachine())
  return router
    .openapi(coachSettingsRoute, async (c) => c.json(await settings.coach(), 200))
    .openapi(updateCoachSettingsRoute, async (c) =>
      c.json(await settings.updateCoach(c.req.valid('json')), 200),
    )
}
