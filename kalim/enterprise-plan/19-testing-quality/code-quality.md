# Code Quality

## Purpose
Document linting, formatting, and quality controls.

## Findings

### Linting

- **Tool**: ESLint (via `oxlint` — Rust-based fast linter)
- **Config**: `.oxlintrc.json` (Oxlint config)
- Also: `.oxlintrc.json` references TypeScript rules
- Extensions linted separately: `tsconfig.oxlint.extensions.json`

### Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `pnpm lint` | Run all linters | Full lint |
| `pnpm lint:core` | Lint core source | `src/` only |
| `pnpm lint:extensions` | Lint extensions | `extensions/` only |
| `pnpm lint:scripts` | Lint scripts | `scripts/` only |
| `pnpm lint:ui` | Lint UI | `ui/src/` only |

### Formatting

- **Tool**: Prettier (implied by config)
- **Config**: `.prettierrc` or `prettier` in package.json
- Also: `oxfmt` may be used for fast formatting
- Pre-commit hook: formats staged files

### Type Checking

- **Tool**: TypeScript (`tsc`)
- **Config**: `tsconfig.json` + workspace configs
- Strict mode enabled
- No `any` type usage discouraged (enforced in lint)

### Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `pnpm typecheck` | `tsc --noEmit` | Type check all |
| `pnpm typecheck:core` | Core only | `src/` + packages |
| `pnpm typecheck:extensions` | Extensions only | `extensions/` |
| `pnpm typecheck:ui` | UI only | `ui/src/` |

### Pre-commit Hooks

- `.pre-commit-config.yaml` — pre-commit framework config
- Hooks:
  - Format staged files
  - Lint staged files
  - No commit to `main` branch protection
- Git hooks in `.git/hooks/`

### Architecture Enforcement

- `test/extension-import-boundaries.test.ts` — extension import rules
- `test/architecture-smells.test.ts` — forbidden patterns
- `test/import-cycles.test.ts` — no circular imports
- Extensions cannot import from `src/` directly (must use SDK)

### Code Review

- GitHub PR template in `.github/pull_request_template.md`
- CODEOWNERS file for review assignment
- Automated checks: lint, typecheck, test
- Required status checks before merge

### Documentation Quality

- Markdown linting: `markdownlint` configured
- Config: `.markdownlint-cli2.jsonc`
- Checks for broken links, formatting

### Security Scanning

- `detect-secrets` — pre-commit secret detection
- `.detect-secrets.cfg` — configuration
- `.secrets.baseline` — known safe patterns
- CodeQL analysis in `.github/workflows/`

### Dependency Audit

- `pnpm audit` — checks for known vulnerabilities
- Dependabot configured (`.github/dependabot.yml`)
- Weekly dependency updates

### Performance

- No formal performance budgets
- Startup benchmark: `test/cli-startup-bench.json`
- Bundle size not strictly monitored
- Build time tracked in CI

## Evidence
- `.oxlintrc.json` — linter config
- `.pre-commit-config.yaml` — pre-commit hooks
- `test/architecture-smells.test.ts` — architecture tests
- `test/extension-import-boundaries.test.ts` — boundary tests
- `.github/dependabot.yml` — dependency updates
- `.detect-secrets.cfg` — secret detection

## Notes
- Quality toolchain is modern and comprehensive
- Oxlint provides fast linting (Rust-based)
- Pre-commit hooks enforce formatting
- Architecture tests prevent tech debt
- No strict coverage thresholds
- Security scanning is automated but not exhaustive
