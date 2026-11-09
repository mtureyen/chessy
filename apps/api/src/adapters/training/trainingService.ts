import type { TrainingBody, TrainingResultBody } from '@pawnia/contracts'

// Types only: app.ts (and through it the web app's typed client) sees this file, not the code
// behind it.

/** The user's puzzles, as the routes see them. */
export interface TrainingService {
  training(): Promise<TrainingBody>
  record(result: TrainingResultBody): Promise<void>
}
