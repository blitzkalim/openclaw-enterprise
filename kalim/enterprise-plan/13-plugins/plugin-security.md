# Plugin Security

## Purpose
Security model for plugin loading and execution.

## Findings

### Plugin Isolation Model

**No True Isolation**
- Plugins run in same Node.js process as core
- Same memory space, same event loop
- `import()` loads plugin code directly into process
- Plugin crash can bring down entire gateway

### Security Boundaries

1. **SDK Contract**
   - Plugins access core only via `openclaw/plugin-sdk/*`
   - `src/plugins/contracts/plugin-sdk-subpaths.ts` — validates subpaths
   - No direct `src/` imports allowed in production

2. **Extension Code Rules**
   - `extension.prod.code` rule: no deep core imports
   - Architecture tests enforce: `extension-import-boundaries.test.ts`
   - Violations caught in CI

3. **Native Dependencies**
   - `src/plugins/runtime/native-deps.ts` — native dependency management
   - Platform-specific binaries must be available
   - `matrix-sdk-crypto*.node` verified at Docker build time

4. **Manifest Validation**
   - `package.json` `openclaw` block validated at load
   - Unknown manifest keys ignored
   - Malformed manifests rejected

### Plugin Installation Security

1. **NPM Installation**
   - `openclaw install <pkg>` — npm install under `node_modules/`
   - Same security model as npm (trust npm registry)
   - `npmSpec` in manifest for auto-install

2. **Bundled Extensions**
   - Extensions in `extensions/*/` are source-reviewed
   - Build-time inclusion only
   - No runtime loading of arbitrary bundled extensions

3. **Postinstall Scripts**
   - `scripts/postinstall-bundled-plugins.mjs` — safe postinstall
   - No arbitrary script execution from extensions

### Plugin Runtime Security

1. **Sandbox for Agent Tools**
   - Agent sandbox (`docker`, `ssh`, `openshell`) isolates tool execution
   - Plugin tools can be sandboxed per-session
   - Main session NOT sandboxed by default

2. **SSRF Protection**
   - `src/security/ssrf.ts` — URL validation
   - Applies to all HTTP requests made by plugins
   - Blocks internal network access

3. **No Plugin Permission Model**
   - No granular permissions per plugin
   - All plugins have equal access to SDK surface
   - No capability-based access control

### Supply Chain Risks

1. **Dependency Proliferation**
   - 100+ extensions = 100+ dependency trees
   - `pnpm` deduplication helps but doesn't eliminate risk
   - `bundledPluginDir` isolates some dependencies

2. **Native Addon Risks**
   - `matrix-sdk-crypto`, `sharp`, etc. require native builds
   - Prebuilt binaries downloaded from CDN
   - Verification at Docker build (5 retries)

3. **Patch Files**
   - `patches/@whiskeysockets__baileys@7.0.0-rc.9.patch`
   - `patches/@agentclientprotocol__claude-agent-acp@0.31.0.patch`
   - Patches applied at install time — supply chain risk

## Evidence
- `src/plugins/contracts/plugin-sdk-subpaths.ts` — SDK boundary
- `src/plugins/runtime/native-deps.ts` — native deps
- `src/security/ssrf.ts` — SSRF protection
- `test/extension-import-boundaries.test.ts` — boundary tests
- `scripts/postinstall-bundled-plugins.mjs` — postinstall

## Notes
- Plugin security relies on code review and SDK boundaries
- No Wasm/V8 isolate sandboxing for plugins
- Enterprise deployments should audit all installed extensions
- Native addon failures can prevent gateway startup
