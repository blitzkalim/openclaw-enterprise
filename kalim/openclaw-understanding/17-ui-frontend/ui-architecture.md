# UI Frontend Architecture

## Overview

The OpenClaw UI is a **web-based control interface** built with **Lit (Web Components)** and **Vite**. It serves as the primary human-facing interface for configuration, monitoring, conversation, and management.

## Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | Lit (Web Components) |
| Bundler | Vite |
| Styling | CSS / Tailwind (inferred) |
| Icons | Lucide / inline SVG |
| State | Custom reactive store |
| Routing | Client-side hash or path-based |
| Communication | WebSocket + REST API |
| Build Output | Static files served by gateway |

## UI Location

```
ui/
  +-- src/
  |     +-- components/         → Web Components
  |     +-- pages/              → Route-level views
  |     +-- stores/             → State management
  |     +-- services/           → API clients
  |     +-- styles/             → Global styles
  |     +-- index.ts            → Entry point
  +-- vite.config.ts            → Vite config
  +-- package.json              → UI deps
  +-- tsconfig.json             → TS config
```

## UI Features (from README and architecture)

| Feature | Description |
|---------|-------------|
| **Chat** | Real-time conversation with agent |
| **Canvas** | Live collaborative canvas (mentioned in README) |
| **Config Editor** | JSON config editing with validation |
| **Channel Management** | Start/stop/restart channels |
| **Session Browser** | View conversation history |
| **Diagnostics** | View system logs and events |
| **Memory Browser** | Search and manage vector memory |
| **Plugin Manager** | Install/enable/disable plugins |
| **Model Selector** | Choose active LLM model |
| **Approval Queue** | Approve/reject pending tool executions |
| **Settings** | UI preferences, theme, etc. |

## Communication Pattern

```
Browser
  |
  +-- WebSocket /gateway (for real-time events)
  |     +-- auth: { token }
  |     +-- subscribe: { sessionKey }
  |     +-- Receive: tokens, tool events, errors, status
  |
  +-- REST API (for config, actions)
  |     +-- GET /health
  |     +-- POST /v1/chat/completions
  |     +-- POST /gateway (gateway methods)
  |     +-- GET /api/config
  |     +-- POST /api/config/reload
  |     +-- GET /api/sessions
  |     +-- GET /api/diagnostics
  |
  +-- Static files
        +-- GET / (index.html)
        +-- GET /assets/*.js, *.css
```

## WebSocket Events in UI

```typescript
// UI subscribes to events
ws.on("token", ({ content, sessionKey }) => {
  appendToChat(sessionKey, content);
});

ws.on("tool_call", ({ toolCall }) => {
  showToolCallIndicator(toolCall.name);
});

ws.on("approval_request", ({ executionId, toolName, args }) => {
  showApprovalDialog(executionId, toolName, args);
});

ws.on("config_change", ({ key, value }) => {
  updateConfigDisplay(key, value);
});

ws.on("channel_status", ({ channelId, status }) => {
  updateChannelIndicator(channelId, status);
});
```

## Gateway Static File Serving

```typescript
// Gateway serves UI static files
app.use("/", express.static(path.join(__dirname, "../ui/dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../ui/dist/index.html"));
});
```

SPA routing: all routes serve `index.html`, client handles routing.

## Native Apps

OpenClaw has **native mobile/desktop clients** (from README):

| Platform | Technology | Notes |
|----------|-----------|-------|
| iOS | Swift | Native app |
| macOS | Swift | Native app |
| Android | Kotlin | Native app |

Native apps communicate with gateway via:
- REST API
- WebSocket
- Platform-specific push notifications (if configured)

## Key Files

- `ui/` — UI source code
- `ui/src/` — Components and pages
- `ui/package.json` — UI dependencies
- `src/gateway/server-impl.ts` — Static file serving
- `src/gateway/server-ws-runtime.ts` — WebSocket for UI

---

*Evidence: `ui/` directory listing, `README.md` (speaking/listening on macOS/iOS/Android, live Canvas), `src/gateway/server-impl.ts` static file patterns.*
