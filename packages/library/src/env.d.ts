/**
 * Runtime-neutral globals. This package runs in browsers, Bun and Node, so it gets neither the
 * DOM nor the Node type libraries, only what all of them provide. Pulled in by index.ts.
 */
declare global {
  function structuredClone<T>(value: T): T
  function setTimeout(handler: () => void, timeout?: number): unknown
  /** The WHATWG URL parser (browsers, Bun and Node all have it); only the parts we use. */
  class URL {
    constructor(url: string, base?: string)
    readonly hostname: string
    readonly pathname: string
  }
}

export {}
