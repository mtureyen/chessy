import type { StoredCoachSettings } from './coachSettings'
import { readJson, writeJson } from './jsonFile'

export interface StoredSettings {
  coach?: StoredCoachSettings
}

/**
 * The settings page's values in a local JSON file, readable by this user only (it holds API
 * keys). A missing or unreadable file counts as no settings.
 */
export class FileSettingsStore {
  private readonly path: string

  constructor(path: string) {
    this.path = path
  }

  async load(): Promise<StoredSettings> {
    return (await readJson<StoredSettings>(this.path)) ?? {}
  }

  save(settings: StoredSettings): Promise<void> {
    return writeJson(this.path, settings)
  }
}
