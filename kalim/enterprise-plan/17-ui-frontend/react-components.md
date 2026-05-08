# React Components

## Purpose
Document major React component structure.

## Findings

### Component Hierarchy (Top-Level)

```
App
  -> Providers (QueryClient, Theme, Toast)
    -> Router (Wouter)
      -> Layout
        -> Sidebar
        -> Main Content Area
          -> Route: /chat -> ChatPage
          -> Route: /canvas -> CanvasPage
          -> Route: /agents -> AgentsPage
          -> Route: /settings -> SettingsPage
          -> Route: /voice -> VoicePage
```

### Key Components

1. **ChatPage**
   - `ChatContainer` — message list
   - `MessageBubble` — individual message
   - `MessageInput` — text input + file upload
   - `AgentSelector` — choose active agent
   - `StreamingIndicator` — typing/streaming state
   - `FileAttachment` — uploaded files

2. **CanvasPage**
   - `CanvasLayout` — split pane layout
   - `FileExplorer` — workspace file tree
   - `CodeEditor` — Monaco-style editor
   - `TerminalPanel` — terminal output
   - `PreviewPanel` — preview rendered output

3. **AgentsPage**
   - `AgentList` — list of configured agents
   - `AgentCard` — agent summary
   - `AgentEditor` — agent configuration form
   - `ToolToggle` — enable/disable tools
   - `ModelSelector` — LLM model selection

4. **SettingsPage**
   - `SettingsLayout` — tabbed settings
   - `GeneralSettings` — app preferences
   - `ChannelSettings` — channel configuration
   - `PluginSettings` — plugin management
   - `SecuritySettings` — auth/token settings
   - `AdvancedSettings` — debug/diagnostics

5. **VoicePage**
   - `VoiceInterface` — push-to-talk UI
   - `AudioVisualizer` — waveform display
   - `VoiceSettings` — voice/model selection
   - `ConversationHistory` — voice chat history

### Shared Components

- `Button` — shadcn/ui button variants
- `Input` — text input with validation
- `Select` — dropdown selector
- `Dialog` — modal dialogs
- `Toast` — notification toasts
- `Badge` — status badges
- `Skeleton` — loading placeholders
- `Markdown` — message rendering (with syntax highlighting)
- `CodeBlock` — syntax-highlighted code

### State Management

1. **Zustand Stores**
   - `useChatStore` — current chat state
   - `useAgentStore` — agent configuration
   - `useSettingsStore` — user preferences
   - `useThemeStore` — dark/light mode

2. **React Query**
   - Server state caching
   - Config queries
   - Session queries
   - Message history queries

3. **WebSocket Context**
   - Global WS connection
   - Message dispatch
   - Subscription management

### Hooks

- `useWebSocket` — WS connection + message handling
- `useStreaming` — SSE consumption for chat
- `useConfig` — config read/write
- `useAgent` — agent CRUD
- `useChannel` — channel status
- `useMedia` — file upload/download

### Routing

- Wouter (lightweight, ~1KB)
- Routes defined in `App.tsx` or router component
- Hash-based or path-based (configurable)
- No route guards (auth handled globally)

## Evidence
- `ui/src/main.tsx` — entry
- `ui/src/chat/` — chat components
- `ui/src/canvas/` — canvas components
- `ui/src/settings/` — settings components
- `ui/src/components/ui/` — shadcn/ui components
- `ui/src/hooks/` — custom hooks

## Notes
- UI uses modern React patterns (hooks, functional components)
- No class components detected
- shadcn/ui provides accessible, composable components
- Tailwind CSS for all styling (no CSS-in-JS)
- Component tests in `ui/src/**/*.test.tsx` (if any)
