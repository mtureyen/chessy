import type { CoachSettingsBody, CoachSettingsUpdateBody } from '@chessy/contracts'

// Types only: app.ts (and through it the web app's typed client) sees this file, not the
// settings file and the agents behind it.

/** The settings page's side of the API. */
export interface SettingsService {
  coach(): Promise<CoachSettingsBody>
  updateCoach(update: CoachSettingsUpdateBody): Promise<CoachSettingsBody>
}
