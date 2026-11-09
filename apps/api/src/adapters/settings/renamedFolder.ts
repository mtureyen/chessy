import { existsSync, renameSync } from 'node:fs'

/**
 * Renames the folder kept under the app's old name to the new one, as it is: its files (API keys
 * among them) are moved, never read. A folder already under the new name wins, and the old one
 * stays where it is.
 */
export function moveRenamedFolder(oldDir: string, newDir: string): 'moved' | 'kept' | 'none' {
  if (!existsSync(oldDir)) return 'none'
  if (existsSync(newDir)) return 'kept'
  renameSync(oldDir, newDir)
  return 'moved'
}
