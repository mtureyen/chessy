import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** The file is there but can't be read as JSON (or not at all). */
export class UnreadableFileError extends Error {
  constructor(path: string, cause: unknown) {
    super(
      `${path} can't be read (${cause instanceof Error ? cause.message : String(cause)}). Fix or remove the file.`,
    )
    this.name = 'UnreadableFileError'
  }
}

/**
 * A local JSON file's value; undefined when there is no such file. A file that is there but
 * can't be read throws: taking it for an empty one, the next save would write over what it holds.
 */
export async function readJson<T>(path: string): Promise<T | undefined> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new UnreadableFileError(path, error)
  }
  try {
    return JSON.parse(text) as T
  } catch (error) {
    throw new UnreadableFileError(path, error)
  }
}

/** Readable by this user only, and written to a temporary file first, so a crash never leaves half a file. */
export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await chmod(temporary, 0o600)
  await rename(temporary, path)
}
