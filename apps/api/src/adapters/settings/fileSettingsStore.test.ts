import { mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FileSettingsStore } from './fileSettingsStore'

describe('FileSettingsStore', () => {
  it('keeps settings in a file only this user can read', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'pawnia-settings-')), 'nested', 'settings.json')
    const store = new FileSettingsStore(path)
    expect(await store.load()).toEqual({})
    await store.save({ coach: { claudeApi: { apiKey: 'sk-ant-secret-key-1234' } } })
    expect(await store.load()).toEqual({
      coach: { claudeApi: { apiKey: 'sk-ant-secret-key-1234' } },
    })
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })

  it('treats an unreadable file as no settings', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'pawnia-settings-')), 'settings.json')
    writeFileSync(path, '{ not json')
    expect(await new FileSettingsStore(path).load()).toEqual({})
  })
})
