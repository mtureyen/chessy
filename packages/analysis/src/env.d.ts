/**
 * Runtime-neutral globals. This package runs in browsers, Bun and Node, so it gets neither the
 * DOM nor the Node type libraries, only what all of them provide.
 */
declare function setTimeout(handler: () => void, timeout?: number): unknown
declare function clearTimeout(id: unknown): void
