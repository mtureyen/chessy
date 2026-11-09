import { spawn } from 'node:child_process'
import type { UciTransport } from '@pawnia/analysis'

/** UciTransport over a child process (native Stockfish): one UCI command per stdin line. */
export function createProcessTransport(
  command: string,
  args: readonly string[] = [],
): UciTransport {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'ignore'] })
  const lineListeners = new Set<(line: string) => void>()
  const errorListeners = new Set<(error: Error) => void>()
  let terminated = false
  let buffer = ''

  const fail = (error: Error) => {
    if (terminated) return
    for (const listener of errorListeners) listener(error)
  }

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk
    for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
      const line = buffer.slice(0, end).replace(/\r$/, '')
      buffer = buffer.slice(end + 1)
      if (line) for (const listener of lineListeners) listener(line)
    }
  })
  child.on('error', (error) =>
    fail(new Error(`Engine could not be started (${command}): ${error.message}`)),
  )
  child.on('exit', (code, signal) =>
    fail(new Error(`Engine exited unexpectedly (${signal ?? `code ${code}`})`)),
  )
  // Writing to a process that just died raises EPIPE on stdin; the exit handler reports it.
  child.stdin.on('error', () => undefined)

  return {
    send(command) {
      if (!terminated && child.stdin.writable) child.stdin.write(`${command}\n`)
    },
    onLine(listener) {
      lineListeners.add(listener)
      return () => lineListeners.delete(listener)
    },
    onError(listener) {
      errorListeners.add(listener)
      return () => errorListeners.delete(listener)
    },
    terminate() {
      terminated = true
      child.stdin.end()
      child.kill()
    },
  }
}
