/**
 * Architecture rules (overview in README.md#architecture).
 * Run with `bun run check:boundaries`; CI fails on any violation.
 */
const FRAMEWORKS = 'node_modules/(react|react-dom|hono|@hono|@scalar|dexie|chessground|@tanstack)/'

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make modules impossible to reason about or extract.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'packages-not-to-apps',
      severity: 'error',
      comment: 'Packages (contexts, contracts) must not depend on deployable apps.',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'apps-not-to-other-apps',
      severity: 'error',
      comment:
        'Apps are independent deployables. Only type-only imports are allowed (typed API client).',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment: 'domain/ holds pure logic: no ports, no use cases, no frameworks.',
      from: { path: '^packages/[^/]+/src/domain/' },
      to: { path: ['^packages/[^/]+/src/(ports|usecases)/', FRAMEWORKS] },
    },
    {
      name: 'ports-not-to-usecases',
      severity: 'error',
      comment: 'Ports describe the outside world; they must not depend on use cases.',
      from: { path: '^packages/[^/]+/src/ports/' },
      to: { path: '^packages/[^/]+/src/usecases/' },
    },
    {
      name: 'packages-framework-free',
      severity: 'error',
      comment:
        'Contexts run in browser and server alike. Only contracts may use the OpenAPI toolkit.',
      from: { path: '^packages/', pathNot: '^packages/contracts/' },
      to: { path: FRAMEWORKS },
    },
    {
      name: 'chess-is-shared-kernel',
      severity: 'error',
      comment: 'chess is the shared core: everyone may use it, it uses no other context.',
      from: { path: '^packages/chess/' },
      to: { path: '^packages/(?!chess/)' },
    },
    {
      name: 'contexts-only-via-public-api',
      severity: 'error',
      comment: 'Use another package only through its src/index.ts, never its internals.',
      from: { path: '^packages/([^/]+)/' },
      to: {
        path: '^packages/[^/]+/src/',
        pathNot: ['^packages/$1/', '^packages/[^/]+/src/index\\.ts$'],
      },
    },
    {
      name: 'apps-only-via-public-api',
      severity: 'error',
      comment: 'Apps use packages only through their src/index.ts.',
      from: { path: '^apps/' },
      to: { path: '^packages/[^/]+/src/', pathNot: '^packages/[^/]+/src/index\\.ts$' },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'Every import must resolve (catches typos and missing dependencies).',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-undeclared-dependencies',
      severity: 'error',
      comment: 'Runtime code may only import packages declared in its own package.json.',
      from: { path: '^(apps|packages)/[^/]+/src/', pathNot: '\\.test\\.tsx?$' },
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|node_modules|test-results|playwright-report)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    combinedDependencies: false,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.d.ts'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
}
