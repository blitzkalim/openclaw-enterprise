# Test Suite

## Purpose
Document the testing framework, coverage, and key test areas.

## Findings

### Test Framework

- **Runner**: Vitest (primary)
- **E2E**: Playwright (some browser tests)
- **Unit Tests**: `.test.ts` files colocated with source
- **E2E Tests**: `.e2e.test.ts` files

### Test Organization

| Category | Pattern | Location |
|----------|---------|----------|
| Unit tests | `*.test.ts` | Colocated with source |
| Integration tests | `*.test.ts` | `test/` directory |
| E2E tests | `*.e2e.test.ts` | `test/` + extension tests |
| Extension tests | `index.test.ts` | `extensions/<name>/` |

### Test Commands

| Command | Scope |
|---------|-------|
| `pnpm test` | All tests |
| `pnpm test:changed` | Tests for changed files only |
| `pnpm test:serial` | Sequential execution (no parallel) |
| `pnpm test:extensions` | Extension tests only |
| `pnpm test <path>` | Specific test file |

### Key Test Areas

1. **Auth Tests**
   - `test/auth-wizard.ts` — auth flow helpers
   - `src/gateway/auth.test.ts` — credential resolution
   - `src/gateway/startup-auth.test.ts` — startup auth config
   - Password hashing, token validation, rate limiting

2. **Config Tests**
   - `src/config/config.test.ts` — config loading/validation
   - `src/config/io.test.ts` — file IO
   - `src/config/validation.test.ts` — schema validation
   - Migration and recovery tests

3. **Agent Tests**
   - `src/agents/apply-patch.test.ts` — patch application
   - `src/agents/sandbox/*.test.ts` — sandbox operations
   - `src/agents/openai-transport-stream.test.ts` — streaming
   - Message processing pipeline

4. **Gateway Tests**
   - `src/gateway/server.impl.test.ts` — server initialization
   - `src/gateway/server-http.test.ts` — HTTP handling
   - `src/gateway/auth.test.ts` — auth middleware

5. **Channel Tests**
   - `extensions/telegram/index.test.ts` — Telegram
   - `extensions/whatsapp/index.test.ts` — WhatsApp
   - `src/channels/channel.test.ts` — generic channel logic

6. **Tool Tests**
   - Tool execution validation
   - SSRF protection tests
   - File operation sandbox tests

7. **Extension Import Boundaries**
   - `test/extension-import-boundaries.test.ts` — ensures extensions don't import core internals
   - Architecture enforcement test

8. **Architecture Smells**
   - `test/architecture-smells.test.ts` — detects cyclic imports, forbidden imports
   - `test/import-cycles.test.ts` — import cycle detection

9. **CLI Tests**
   - `test/cli-json-stdout.e2e.test.ts` — CLI JSON output
   - `test/cli-startup-bench.json` — startup benchmark

10. **Plugin SDK Tests**
    - `packages/plugin-sdk/src/**/*.test.ts` — SDK contract tests
    - API surface validation

### Test Configuration

- `vitest.config.ts` — root Vitest config
- `vitest.workspace.ts` — workspace mode for monorepo
- Coverage: not heavily configured (no strict threshold)
- Mocking: extensive use of Vitest mocks
- Fixtures: `test/fixtures/` for test data

### Test Helpers

- `test/helpers/` — shared test utilities
  - `auth-wizard.ts` — auth setup
  - `agents/` — agent test utilities
  - `channels/` — channel test utilities
  - `auto-reply/` — auto-reply test utilities

### Known Test Gaps

- No E2E tests for WhatsApp (requires live connection)
- No load/performance tests
- Limited security penetration tests
- No chaos engineering tests
- Some extensions lack tests entirely

### CI Integration

- GitHub Actions runs `pnpm test:changed` on PRs
- Full suite runs on `main` branch
- Test results reported in PR checks

## Evidence
- `vitest.config.ts` — test runner config
- `test/` — test directory
- `src/**/*.test.ts` — unit tests
- `test/extension-import-boundaries.test.ts` — architecture tests

## Notes
- Test suite is substantial but not comprehensive
- Extension test coverage varies significantly
- Architecture tests enforce import boundaries
- No mutation testing detected
- E2E tests limited to CLI and gateway HTTP
