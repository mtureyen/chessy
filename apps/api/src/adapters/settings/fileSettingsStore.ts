import type { StoredCoachSettings } from './coachSettings'
import { readJson, writeJson } from './jsonFile'

export interface StoredSettings {
  coach?: StoredCoachSettings
}

/**
 * The settings page's values in a local JSON file, readable by this user only (it holds API
 * keys). A missing file counts as no settings; one that can't be read stops the API from
 * starting, so the keys in it aren't written over.
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
