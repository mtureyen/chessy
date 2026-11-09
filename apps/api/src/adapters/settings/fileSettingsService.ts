import type { CoachSettingsBody, CoachSettingsUpdateBody } from '@pawnia/contracts'
import type { Config } from '../../config'
import type { CoachRegistry } from '../coach/agents'
import { applyCoachUpdate, coachView, effectiveCoach } from './coachSettings'
import type { FileSettingsStore } from './fileSettingsStore'
import type { SettingsService } from './settingsService'

/** The settings page's values over .env, kept in a file; the coach follows every change. */
export class FileSettingsService implements SettingsService {
  private readonly config: Config
  private readonly store: FileSettingsStore
  private readonly registry: CoachRegistry
  private queue: Promise<unknown> = Promise.resolve()

  constructor(config: Config, store: FileSettingsStore, registry: CoachRegistry) {
    this.config = config
    this.store = store
    this.registry = registry
  }

  /** Builds the coach from the stored settings (at start). */
  async load(): Promise<void> {
    const { coach } = await this.store.load()
    this.registry.configure(effectiveCoach(this.config, coach))
  }

  async coach(): Promise<CoachSettingsBody> {
    return coachView(this.config, (await this.store.load()).coach)
  }

  /** One change at a time, so two saves can't overwrite each other's fields. */
  updateCoach(update: CoachSettingsUpdateBody): Promise<CoachSettingsBody> {
    const run = this.queue.then(async () => {
      const settings = await this.store.load()
      const coach = applyCoachUpdate(settings.coach ?? {}, update)
      await this.store.save({ ...settings, coach })
      this.registry.configure(effectiveCoach(this.config, coach))
      return coachView(this.config, coach)
    })
    this.queue = run.catch(() => undefined)
    return run
  }
}
