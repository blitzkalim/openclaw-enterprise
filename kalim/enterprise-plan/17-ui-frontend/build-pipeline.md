# Build Pipeline

## Purpose
Document the build and bundling process.

## Findings

### Build System Overview

```
Root build
  -> Core TypeScript compilation (src/)
    -> Extension TypeScript compilation (extensions/*/)
      -> UI build (Vite)
        -> Copy UI dist to gateway static
          -> Final package ready
```

### Core Build

- **Tool**: `tsdown` (fast TypeScript bundler, based on Rolldown)
- **Config**: `tsdown.config.ts`
- **Output**: `dist/` (ESM)
- **Target**: Node.js 22+
- **Features**: Tree-shaking, minification (production)

### Extension Build

- Each extension has `package.json` with build script
- Extensions compiled to `dist/` within each extension folder
- Some extensions use Vite, some use `tsc` or `tsdown`
- Build order: core first, then extensions (dependency order)

### UI Build

- **Tool**: Vite 6
- **Config**: `ui/vite.config.ts`
- **Plugins**: @vitejs/plugin-react, Tailwind CSS
- **Output**: `ui/dist/`
- **Features**: Code splitting, lazy loading, PWA assets

### Monorepo Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `pnpm build` | Build all packages | Production build |
| `pnpm dev` | Watch mode + UI dev server | Development |
| `pnpm check` | Typecheck + lint + test | CI validation |
| `pnpm check:changed` | Check only changed packages | PR validation |
| `pnpm test` | Run all tests | Test suite |
| `pnpm format` | Format all code | Code formatting |

### Watch Mode

- `pnpm dev` starts gateway in watch mode (tsx/nodemon)
- UI Vite dev server on separate port (usually 5173)
- Gateway proxies UI in dev mode or serves built files
- Hot Module Replacement (HMR) for UI

### Docker Build

- `Dockerfile` — multi-stage build
- Stage 1: Build core + UI
- Stage 2: Runtime with Node.js 22
- `docker-compose.yml` — local orchestration
- Image published to Docker Hub / GitHub Container Registry

### Native App Builds

| Platform | Build Tool | Output |
|----------|-----------|--------|
| iOS | Xcode + SwiftPM | `.ipa` / App Store |
| macOS | SwiftPM | `.app` / DMG |
| Android | Gradle | `.apk` / AAB |

### CI/CD Pipeline

- GitHub Actions workflows in `.github/workflows/`
- Key workflows:
  - `ci.yml` — test, lint, build on PR
  - `release.yml` — build and publish releases
  - `docker.yml` — build and push Docker images
  - `docs.yml` — build and deploy documentation

### Build Artifacts

- `dist/` — compiled gateway
- `ui/dist/` — built UI
- `extensions/*/dist/` — compiled extensions
- `apps/macos/.build/` — macOS app
- `apps/ios/build/` — iOS app
- `apps/android/app/build/` — Android app

### Environment-specific Builds

- Development: source maps, no minification, HMR
- Production: minified, no source maps, optimized
- Docker: production build inside container
- Native apps: platform-specific release signing

## Evidence
- `tsdown.config.ts` — core build config
- `ui/vite.config.ts` — UI build config
- `package.json` — scripts
- `Dockerfile` — container build
- `.github/workflows/` — CI pipelines

## Notes
- `tsdown` is a relatively new bundler (faster than tsup/esbuild)
- Build can take several minutes for full clean build
- Extensions build in parallel where possible
- UI build is separate from gateway build but integrated at runtime
- No separate backend API build — gateway serves UI statically
