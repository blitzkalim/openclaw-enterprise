# Supply Chain Security

## Purpose
Document supply chain risks, trusted sources, and dependency management.

## Findings

### Package Manager

- **pnpm** — strict lockfile (`pnpm-lock.yaml`)
- Workspace-aware
- Content-addressable store
- Monorepo with 100+ packages (core + extensions)

### Registry

- Default: npm registry (registry.npmjs.org)
- No private registry detected
- No Verdaccio or Artifactory config
- Scoped packages (`@openclaw/*`) from npm

### Lockfile Integrity

- `pnpm-lock.yaml` — hash-verified installs
- No `package-lock.json` or `yarn.lock`
- Lockfile is committed to git
- CI uses `pnpm install --frozen-lockfile`

### Dependency Update Strategy

- **Dependabot**: Configured (`.github/dependabot.yml`)
  - Weekly scans
  - PRs for version bumps
  - Grouped updates where configured

- **Manual Updates**: `pnpm update` for major versions

### Trusted Sources

| Source | Packages | Trust |
|--------|----------|-------|
| npm registry | All public deps | Standard |
| GitHub (git deps) | Some extensions | Source control |
| Local file | Workspace packages | Internal |

### Security Scanning

1. **pnpm audit**
   - Run in CI (likely)
   - Checks against npm vulnerability database
   - Fails CI on critical vulnerabilities

2. **detect-secrets**
   - Pre-commit hook
   - Scans for API keys, tokens in code
   - `.secrets.baseline` for known safe strings

3. **CodeQL**
   - GitHub Actions workflow
   - Static analysis for security patterns
   - JavaScript/TypeScript analysis

### Risks

| Risk | Severity | Details |
|------|----------|---------|
| Malicious dependency injection | Medium | No provenance verification beyond npm |
| Typosquatting | Medium | pnpm install from npm registry only |
| Compromised build tool | Medium | Vite, tsdown — widely used |
| Compromised native dep | High | better-sqlite3, lancedb compile C++ |
| Extension supply chain | Medium | Extension deps less audited |
| Lockfile tampering | Low | Git history + CI `--frozen-lockfile` |
| Git dependency (no hash pin) | Medium | Some deps may use `github:` without commit hash |

### SBOM / Provenance

- No explicit SBOM generation
- No SLSA provenance attestations
- No signed releases detected
- Docker images may have digest pinning

### Mitigations Present

1. Lockfile strictness (`pnpm-lock.yaml`)
2. Dependabot automated updates
3. `detect-secrets` pre-commit
4. CodeQL static analysis
5. CI gates (test + lint before merge)

### Gaps

1. No dependency pinning by content hash (only version+integrity)
2. No vendor directory or vendoring
3. No runtime integrity checks (no module signature verification)
4. No private registry for internal packages
5. No automated dependency vulnerability blocking in CI
6. No provenance/SLSA

## Evidence
- `pnpm-lock.yaml` — lockfile
- `.github/dependabot.yml` — automated updates
- `.detect-secrets.cfg` — secret scanning
- `.github/workflows/` — CI security scanning
- `package.json` — dependency declarations

## Notes
- Supply chain security is standard for open-source Node.js projects
- pnpm store provides some integrity via content hashing
- Native dependencies are the highest risk (compile from source)
- Extension ecosystem adds unvetted dependency surface
- Recommend: periodic `pnpm audit`, review Dependabot PRs promptly
