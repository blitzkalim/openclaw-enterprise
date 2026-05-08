# NPM Dependencies

## Purpose
Document the Node.js dependency tree and key packages.

## Findings

### Root Dependencies

The project uses `pnpm` with workspace configuration.

### Core Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ~5.6 | Language |
| `tsx` | latest | TypeScript execution |
| `node` | 22.x | Runtime (required) |
| `react` | 19 | UI framework |
| `react-dom` | 19 | UI renderer |
| `vite` | 6 | UI bundler |
| `@vitejs/plugin-react` | latest | Vite React plugin |
| `tailwindcss` | 4 | CSS framework |
| `zod` | latest | Schema validation |
| `jiti` | latest | Config loading |

### Gateway Server

| Package | Purpose |
|---------|---------|
| `ws` | WebSocket server/client |
| `express` or `fastify` | HTTP server (verify) |
| `body-parser` | Request parsing |
| `cors` | CORS headers |
| `helmet` | Security headers |

### LLM / AI

| Package | Purpose |
|---------|---------|
| `openai` | OpenAI API client |
| `@anthropic-ai/sdk` | Anthropic client |
| `@google/genai` or `google-auth-library` | Google AI |
| `tiktoken` | Token counting |

### Channels

| Package | Purpose |
|---------|---------|
| `@whiskeysockets/baileys` | WhatsApp Web |
| `node-telegram-bot-api` or `telegraf` | Telegram |
| `discord.js` | Discord |
| `@slack/web-api` | Slack |

### Database / Storage

| Package | Purpose |
|---------|---------|
| `lancedb` | Vector store |
| `better-sqlite3` | SQLite driver |
| `json5` | JSON5 parsing |

### Testing

| Package | Purpose |
|---------|---------|
| `vitest` | Test runner |
| `playwright` | E2E testing |
| `@testing-library/react` | React component tests |

### Build / Dev

| Package | Purpose |
|---------|---------|
| `tsdown` | TypeScript bundler |
| `eslint` / `oxlint` | Linting |
| `prettier` | Formatting |
| `husky` | Git hooks |

### Security

| Package | Purpose |
|---------|---------|
| `bcrypt` or `argon2` | Password hashing |
| `rate-limiter-flexible` | Rate limiting |

### Key DevDependencies

| Package | Purpose |
|---------|---------|
| `@types/node` | Node.js types |
| `@types/react` | React types |
| `@types/ws` | WebSocket types |
| `typescript` | Compiler |

### Dependency Risks

1. **Native Dependencies**
   - `better-sqlite3` — requires native compilation
   - `lancedb` — may require native bindings
   - Baileys — depends on `protobufjs` and `ws`

2. **Large Dependency Trees**
   - WhatsApp (Baileys) brings many crypto/protobuf deps
   - Discord.js is large
   - Full install: 500+ packages likely

3. **Security Surface**
   - `ws` — WebSocket library (past vulns)
   - `axios` / `fetch` — HTTP clients
   - Image processing libraries (Sharp, etc.)

4. **Version Pinning**
   - Uses `pnpm-lock.yaml` (strict locking)
   - Dependabot for updates
   - Some packages use `latest` or `^` ranges

### Workspace Dependencies

- `packages/plugin-sdk/` — shared by all extensions
- `packages/memory-host-sdk/` — memory system SDK
- `packages/plugin-package-contract/` — package metadata

## Evidence
- `package.json` — root dependencies
- `pnpm-lock.yaml` — locked versions
- `pnpm-workspace.yaml` — workspace config
- `extensions/*/package.json` — extension deps
- `ui/package.json` — UI deps

## Notes
- Full dependency tree is large (1000+ packages with all extensions)
- pnpm deduplication helps reduce disk usage
- Native deps may cause build issues on some platforms
- Docker build handles native compilation in container
- Audit: `pnpm audit` regularly for vulnerabilities
