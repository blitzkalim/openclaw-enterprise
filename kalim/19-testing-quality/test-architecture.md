# Testing & Quality

## Test Framework

| Component | Technology |
|-----------|------------|
| Runner | Vitest |
| Coverage | Vitest c8/v8 |
| E2E | Playwright (inferred) |
| Type Check | `tsgo` lanes (custom) |
| Lint | oxlint + oxfmt |

## Scripts

```json
{
  "test": "vitest run",
  "test:changed": "vitest run --changed",
  "test:serial": "vitest run --maxWorkers=1",
  "test:coverage": "vitest run --coverage",
  "test:extensions": "vitest run extensions/",
  "check:changed": "...",
  "check:import-cycles": "...",
  "check:architecture": "..."
}
```

## Organization

- `*.test.ts` — Colocated with source
- `*.e2e.test.ts` — End-to-end tests
- `__tests__/` — Top-level test suites
- `extensions/**/` — Extension-specific tests

## Key Test Areas

| Area | Pattern | Notes |
|------|---------|-------|
| Gateway | `src/gateway/**/*.test.ts` | Auth, routing, WS |
| Agents | `src/agents/**/*.test.ts` | Tool execution, planning |
| Channels | `src/channels/**/*.test.ts` | Message normalization |
| Config | `src/config/**/*.test.ts` | Schema validation |
| Extensions | `extensions/**/src/**/*.test.ts` | Provider/channel tests |

## Coverage

- No specific coverage target observed
- `test:coverage` runs coverage report
- CI may enforce thresholds

## Changed-Gate

```bash
pnpm check:changed
# Tests only changed files/packages
# Sparse worktree safe
```

## Key Files

- `vitest.config.ts` / `vitest.config.mjs`
- `package.json` test scripts
- `tsgo` configs

---

*Evidence: `package.json` scripts, `__tests__/` directory, AGENTS.md testing rules.*
