# Detected Architecture

## Verdict: Modular Monolith with Plugin Extension Model

OpenClaw is best described as a **modular monolith** — not a pure microservices architecture, but also not a simple monolith. It uses a **plugin-based extension system** with a central gateway that routes messages between AI agents and external channels.

## Evidence

### 1. Single Gateway Process
- One Node.js process runs the `gateway` HTTP/WebSocket server (`src/gateway/server.impl.ts`)
- All channels, providers, and agents run within this single process via plugin runtime
- No service mesh or inter-service RPC between core components

### 2. Plugin Extension Model
- Core (`src/`) is extension-agnostic — no bundled extension IDs in core
- Extensions cross into core only via `openclaw/plugin-sdk/*` exports
- Extensions live in `extensions/*/` with their own package boundaries
- 100+ extensions covering channels, providers, tools, diagnostics

### 3. Monorepo Workspace
- `pnpm-workspace.yaml` defines: `.`, `ui`, `packages/*`, `extensions/*`
- Root package (`openclaw`) is both the CLI entry and the plugin SDK publisher
- `packages/plugin-sdk/` provides typed contracts for third-party plugins

### 4. Native Apps (Separate Build Targets)
- `apps/android/` — Kotlin/Gradle, separate from Node.js core
- `apps/ios/` — Swift/XcodeGen, separate from Node.js core
- `apps/macos/` — Swift/XcodeGen, separate from Node.js core
- These are **clients** that connect to the gateway, not microservices

### 5. No Traditional Database
- No SQL/NoSQL database server detected
- State stored in JSON files (`~/.openclaw/`), SQLite (memory/vector), and vector stores (LanceDB)
- Config is file-based (`openclaw.json`)

### 6. Docker Compose (Single Container)
- `docker-compose.yml` defines only `openclaw-gateway` + `openclaw-cli` (same image)
- No separate Redis, Postgres, or queue containers
- Redis may be used internally for some channels but not as a required infrastructure service

### 7. Conclusion
The architecture is:
- **Single-process gateway** with hot-reloadable plugins
- **Extension-agnostic core** with well-defined SDK contracts
- **File-based state** with optional vector memory backends
- **Client-server model** where native apps are thin clients to the gateway

This is a **modular monolith** designed for personal/single-user deployment, with plugin isolation but not service isolation.
