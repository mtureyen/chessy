/** Port: a raw line-based connection to a UCI engine (Web Worker, child process, …). */
export interface UciTransport {
  send(command: string): void
  /** Registers a listener for output lines; returns an unsubscribe function. */
  onLine(listener: (line: string) => void): () => void
  /** Registers a listener for fatal errors (engine failed to load, crashed). */
  onError(listener: (error: Error) => void): () => void
  terminate(): void
}
