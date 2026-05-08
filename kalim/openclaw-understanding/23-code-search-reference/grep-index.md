# Code Search Reference

## Key Patterns for Repository Search

### Authentication

| Pattern | File / grep |
|---------|-------------|
| Gateway auth modes | `grep -r "auth.mode" src/` |
| Token generation | `grep -r "generateToken" src/gateway/` |
| Rate limiting | `grep -r "rateLimit" src/gateway/` |
| Password hashing | `grep -r "bcrypt" src/` |
| Secret comparison | `grep -r "compareSecret" src/gateway/` |

### Gateway

| Pattern | File / grep |
|---------|-------------|
| Server start | `grep -r "startGatewayServer" src/gateway/` |
| WebSocket handlers | `grep -r "wsRuntime" src/gateway/` |
| Channel manager | `grep -r "channelManager" src/gateway/` |
| Request context | `grep -r "requestContext" src/gateway/` |
| Runtime state | `grep -r "runtimeState" src/gateway/` |

### Channels

| Pattern | File / grep |
|---------|-------------|
| Message normalization | `src/channels/message-normalization.ts` |
| Outbound messaging | `src/channels/outbound-messaging.ts` |
| Channel registry | `grep -r "channelRegistry" src/channels/` |
| Webhook router | `src/channels/webhook-router.ts` |

### WhatsApp

| Pattern | File / grep |
|---------|-------------|
| Baileys usage | `grep -r "baileys" extensions/whatsapp/` |
| QR pairing | `grep -r "qr" extensions/whatsapp/src/` |
| Session store | `grep -r "session" extensions/whatsapp/src/` |
| Media decrypt | `grep -r "decryptMedia" extensions/whatsapp/` |

### Telegram

| Pattern | File / grep |
|---------|-------------|
| Bot token | `grep -r "botToken" extensions/telegram/` |
| Webhook handler | `grep -r "webhook" extensions/telegram/src/` |
| Polling | `grep -r "getUpdates" extensions/telegram/src/` |
| Command parsing | `grep -r "bot_command" extensions/telegram/src/` |

### Agents

| Pattern | File / grep |
|---------|-------------|
| Agent runtime | `src/agents/runtime/` |
| Tool system | `src/agents/tools/` |
| Planner | `src/agents/planner/` |
| Context engine | `src/context-engine/` |
| Model catalog | `src/model-catalog/` |

### Config

| Pattern | File / grep |
|---------|-------------|
| Config schema | `src/config/config.ts` |
| Hot reload | `grep -r "watch" src/config/` |
| Secret resolution | `src/secrets/resolution.ts` |
| Auto-enable | `src/config/plugin-auto-enable.ts` |

### Storage

| Pattern | File / grep |
|---------|-------------|
| Session store | `src/sessions/session-store.ts` |
| Media utilities | `src/media/` |
| Memory | `src/memory/` |
| Diagnostics | `src/diagnostics/` |

### UI

| Pattern | File / grep |
|---------|-------------|
| UI components | `ui/src/components/` |
| Pages | `ui/src/pages/` |
| Stores | `ui/src/stores/` |
| Vite config | `ui/vite.config.ts` |

### DevOps

| Pattern | File / grep |
|---------|-------------|
| Docker compose | `docker-compose.yml` |
| Package scripts | `package.json` |
| CI/CD | `.github/workflows/` |
| Env example | `.env.example` |

## Common grep Commands

```bash
# Find all auth-related code
grep -rn "auth" src/gateway/ --include="*.ts"

# Find all WebSocket handling
grep -rn "ws" src/gateway/ --include="*.ts" | grep -v node_modules

# Find tool execution flow
grep -rn "tool" src/agents/ --include="*.ts"

# Find channel implementations
grep -rn "channel" extensions/ --include="*.ts" | head -50

# Find all config references
grep -rn "config" src/ --include="*.ts" | grep -v node_modules | head -100

# Find memory/vector code
grep -rn "memory\|vector\|embedding" src/ --include="*.ts"

# Find diagnostic events
grep -rn "diagnostic\|log\|event" src/diagnostics/ --include="*.ts"

# Find security-related code
grep -rn "secret\|token\|password\|hash" src/ --include="*.ts" | grep -v node_modules
```

---

*Generated for OpenClaw enterprise audit — quick reference for targeted code exploration.*
