# Dependencies

## Runtime Dependencies

From `package.json`:

| Category | Key Packages |
|----------|-------------|
| Core | `lit`, `zod`, `ws`, `express` |
| AI SDKs | `openai`, `@anthropic-ai/sdk`, `@google/generative-ai` |
| Channels | `baileys`, `discord.js`, `node-telegram-bot-api` |
| Crypto | `bcrypt`, `jsonwebtoken` |
| Config | `json5`, `dotenv` |
| Media | `sharp`, `fluent-ffmpeg` |
| Vector | `sqlite-vec`, `lancedb` |
| Dev | `tsx`, `vitest`, `oxlint`, `oxfmt` |

## Monorepo Packages

```
packages/
  +-- plugin-sdk/         → Extension SDK
  +-- types/              → Shared types
  +-- utils/              → Shared utilities
```

## Extension Dependencies

Each extension has its own `package.json` with dependencies managed by pnpm workspace.

## Security Dependencies

| Package | Purpose |
|---------|---------|
| `bcrypt` | Password hashing |
| `jsonwebtoken` | JWT (if used) |
| `tweetnacl` | NaCl crypto (signatures) |

## Update Strategy

- `pnpm` workspace monorepo
- Renovate or Dependabot likely used
- `minimumReleaseAge` in `pnpm-workspace.yaml`

## Key Files

- `package.json` — Root dependencies
- `pnpm-workspace.yaml` — Workspace config
- `extensions/*/package.json` — Extension deps

---

*Evidence: `package.json`, `pnpm-workspace.yaml`, `extensions/*/package.json`.*
