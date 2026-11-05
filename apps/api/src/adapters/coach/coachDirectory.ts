import type { CoachAgent } from '@chessy/coach'

// Types only: app.ts (and through it the web app's typed client) sees this file, not the agents.

/** The coach's agents as they are now, the default first (they change with the settings). */
export interface CoachDirectory {
  agents(): CoachAgent[]
}
