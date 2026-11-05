import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { StoredCoachSettings } from './coachSettings'

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
    try {
      return JSON.parse(await readFile(this.path, 'utf8')) as StoredSettings
    } catch {
      return {}
    }
  }

  /** Written to a temporary file first, so a crash never leaves half a file. */
  async save(settings: StoredSettings): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
    const temporary = `${this.path}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 })
    await chmod(temporary, 0o600)
    await rename(temporary, this.path)
  }
}
