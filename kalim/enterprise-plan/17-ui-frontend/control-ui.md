# Control UI (Web Frontend)

## Purpose
Document the built-in web-based control panel.

## Findings

### Technology Stack

- **Framework**: React 19 (newer than typical)
- **Build Tool**: Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **State**: React Query (TanStack Query) + Zustand
- **Routing**: Wouter (lightweight React router)
- **Icons**: Lucide React

### Location

- Source: `ui/src/`
- Entry: `ui/index.html` -> `ui/src/main.tsx`
- Build output: `ui/dist/`

### Key UI Modules

| Module | Path | Purpose |
|--------|------|---------|
| Chat | `ui/src/chat/` | Main chat interface |
| Sessions | `ui/src/sessions/` | Session management |
| Canvas | `ui/src/canvas/` | Workspace/canvas editor |
| Agents | `ui/src/agents/` | Agent configuration |
| Channels | `ui/src/channels/` | Channel status/settings |
| Settings | `ui/src/settings/` | App configuration |
| Voice | `ui/src/voice/` | VoiceClaw interface |
| Plugins | `ui/src/plugins/` | Plugin management |
| Theme | `ui/src/theme/` | Dark/light mode |

### Build Integration

- `ui/package.json` — separate package in monorepo
- `pnpm build` — builds UI and copies `ui/dist/` into gateway static serve
- Gateway serves built UI at `/` (SPA fallback)
- No server-side rendering

### Authentication

- Uses gateway token via WebSocket or HTTP headers
- No separate UI login form — token passed via URL query or header
- WebSocket auth: `?token=<gateway_token>` on WS connect
- No session cookies for UI (token-based)

### API Consumption

- WebSocket for real-time updates (messages, streaming)
- HTTP REST for config read/write
- OpenAI-compatible SSE for LLM streaming in chat
- File upload via HTTP multipart

### Key Features

1. **Chat Interface**
   - Message history
   - Streaming response display
   - File attachment upload
   - Agent selector
   - Thinking/reasoning display

2. **Canvas/Workspace**
   - File explorer
   - Code editor (Monaco-like)
   - Terminal panel
   - Read-only / edit modes

3. **Agent Settings**
   - Model selection
   - System prompt editing
   - Tool enable/disable
   - Thinking level (disabled/thinking/deep)

4. **Channel Management**
   - WhatsApp QR pairing
   - Telegram bot token entry
   - Discord bot setup
   - Channel enable/disable

5. **VoiceClaw**
   - Push-to-talk or continuous
   - Audio visualization
   - Voice selection

### Mobile Support

- Responsive design (Tailwind breakpoints)
- PWA capable (manifest.json in `ui/public/`)
- Touch-friendly controls
- Mobile chat optimized

### i18n

- Internationalization framework present
- Language files in `ui/src/i18n/`
- Supported: English + multiple languages

## Evidence
- `ui/package.json` — UI dependencies
- `ui/src/main.tsx` — entry point
- `ui/src/chat/` — chat components
- `ui/src/canvas/` — canvas components
- `ui/src/settings/` — settings components
- `ui/vite.config.ts` — build config

## Notes
- UI is a client-side SPA, all data from gateway APIs
- No offline mode detected
- UI code is separate from gateway but built together
- No separate UI auth — relies on gateway token
- React 19 is cutting-edge (may have compatibility issues)
