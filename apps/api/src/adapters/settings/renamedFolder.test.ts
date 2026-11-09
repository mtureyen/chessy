import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { moveRenamedFolder } from './renamedFolder'

const folders = () => {
  const root = mkdtempSync(join(tmpdir(), 'pawnia-rename-'))
  return { oldDir: join(root, '.chessy'), newDir: join(root, '.pawnia') }
}

describe('moveRenamedFolder', () => {
  it('moves the old folder with its files', () => {
    const { oldDir, newDir } = folders()
    mkdirSync(oldDir)
    writeFileSync(join(oldDir, 'settings.json'), '{"a":1}')
    expect(moveRenamedFolder(oldDir, newDir)).toBe('moved')
    expect(existsSync(oldDir)).toBe(false)
    expect(readFileSync(join(newDir, 'settings.json'), 'utf8')).toBe('{"a":1}')
  })

  it('leaves both alone when the new folder exists', () => {
    const { oldDir, newDir } = folders()
    mkdirSync(oldDir)
    mkdirSync(newDir)
    expect(moveRenamedFolder(oldDir, newDir)).toBe('kept')
    expect(existsSync(oldDir)).toBe(true)
  })

  it('does nothing without an old folder', () => {
    const { oldDir, newDir } = folders()
    expect(moveRenamedFolder(oldDir, newDir)).toBe('none')
    expect(existsSync(newDir)).toBe(false)
  })
})
