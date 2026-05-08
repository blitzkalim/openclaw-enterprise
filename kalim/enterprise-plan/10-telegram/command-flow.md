# Telegram — Command Flow

## Purpose
How Telegram commands (`/command`) are handled.

## Findings

### Command Detection

- Grammy `bot.command()` middleware detects `/command@botname` syntax
- Commands stripped of bot mention before processing
- `src/channels/command-gating.ts` — command gating logic
- Native commands auto-enabled (`nativeCommandsAutoEnabled: true`)

### Native Commands

| Command | Handler | Purpose |
|---------|---------|---------|
| `/start` | `extensions/telegram/src/commands/start.ts` | Welcome / pairing |
| `/help` | `extensions/telegram/src/commands/help.ts` | Help text |
| `/status` | `src/channels/command-gating.ts` | Agent status |
| `/new` | `src/channels/command-gating.ts` | New session |
| `/reset` | `src/channels/command-gating.ts` | Reset session |
| `/model` | `src/channels/command-gating.ts` | Switch model |
| `/verbose` | `src/channels/command-gating.ts` | Toggle verbose |
| `/compact` | `src/channels/command-gating.ts` | Compact mode |
| `/skills` | `src/channels/command-gating.ts` | List skills |
| `/kill` | `src/channels/command-gating.ts` | Kill active run |
| `/auto` | `src/channels/command-gating.ts` | Auto-reply toggle |

### Command Routing

```
Telegram update with /command
  -> Grammy command middleware
    -> extensions/telegram/src/channel.ts
      -> check if native command
        -> YES: execute command handler
          -> reply via Telegram directly
        -> NO: treat as regular text
          -> prepend command to message text
          -> send to agent pipeline
```

### Inline Commands

- Commands in middle of message treated as regular text
- Only messages starting with `/` are command candidates
- Bot mention (`@botname`) stripped for group chats

### Custom Commands

- Agents can define custom commands via skills
- `src/agents/skills.ts` — skill command registration
- Commands surfaced in Telegram bot menu

### Pairing via /start

- Unknown sender receives pairing code on `/start`
- `dmPolicy: "pairing"` required
- Pairing code displayed in reply
- Sender must be added to `allowFrom` for future messages

## Evidence
- `extensions/telegram/src/channel.ts` — command handling
- `src/channels/command-gating.ts` — command gating
- `src/agents/skills.ts` — skill commands
- Grammy `bot.command()` API

## Notes
- Commands bypass agent LLM call (direct execution)
- Fast response for status/kill commands
- Group chat commands work with @botname mention
- Custom commands require agent restart to register
