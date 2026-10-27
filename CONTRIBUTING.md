# Contributing

Architecture overview: [README](README.md#architecture). The layer and boundary rules are enforced by `.dependency-cruiser.cjs`.

## Workflow

1. Branch off `main`
2. Commit in small, self-contained steps; every commit should pass `bun run check`
3. Open a pull request; CI must be green before merging
4. Merge with **squash** (default) or **rebase** when the PR deliberately contains several logical commits

## Branches

`<type>/<short-description>` in kebab-case, for example:

- `feat/analysis-board`
- `fix/promotion-cancel`
- `refactor/engine-lifecycle`

## Commits ([Conventional Commits](https://www.conventionalcommits.org))

```
<type>(<scope>): <summary>

<body: why, not what>
```

| Type       | For                                  |
| ---------- | ------------------------------------ |
| `feat`     | new functionality                    |
| `fix`      | bug fixes                            |
| `refactor` | code changes without behavior change |
| `perf`     | performance                          |
| `test`     | tests only                           |
| `docs`     | documentation                        |
| `build`    | dependencies, build setup            |
| `ci`       | CI configuration                     |
| `chore`    | everything else                      |

**Scopes** are the app or package: `chess`, `analysis`, `contracts`, `api`, `web`, plus `repo` and `ci` for cross-cutting changes. Omit the scope when a change spans several.

- Summary in the imperative, lower case, no trailing period, at most 72 characters
- Mark breaking changes with `!` (`feat(api)!: …`) and explain them in the body

## Pull requests

- Title in the same format as a commit (it becomes the squash commit message)
- Fill in the template: summary, phase/decision links, changes, testing

## Checks

```sh
bun run check   # lint, format, boundaries, typecheck, unit/API tests, build
bun run e2e     # Playwright
```
