/**
 * Runtime-neutral globals. This package runs on the server today and may run in a browser
 * later, so it gets neither the DOM nor the Node type libraries. Pulled in by index.ts.
 */
declare global {
  function structuredClone<T>(value: T): T
}

export {}
