# Telegram Command Flow

## Command Detection

Telegram bot commands are standardized with the `/` prefix and detected via `message.entities`:

```typescript
// Raw message: "/start arg1 arg2"
// message.entities = [{ type: "bot_command", offset: 0, length: 6 }]
// → command name: "start"
// → args: ["arg1", "arg2"]

// With bot mention: "/start@mybot arg1"
// → command name: "start" (bot mention stripped)
// → args: ["arg1"]
```

## Command Normalization

From `src/channels/message-normalization.ts`:

```typescript
function extractCommands(message: TelegramMessage): Command[] {
  if (!message.entities) return [];

  return message.entities
    .filter(e => e.type === "bot_command")
    .map(e => {
      const fullCommand = message.text.slice(e.offset, e.offset + e.length);
      const name = fullCommand.split("@")[0].slice(1); // Remove / and @bot
      const argsText = message.text.slice(e.offset + e.length).trim();
      const args = argsText ? argsText.split(/\s+/) : [];

      return {
        name,
        args,
        botCommand: true,
        fullText: message.text.slice(e.offset),
      };
    });
}
```

## Built-in Commands

Based on common Telegram bot patterns and OpenClaw capabilities:

| Command | Arguments | Purpose | Handler |
|---------|-----------|---------|---------|
| `/start` | None | Welcome message, start interaction | Extension or core |
| `/help` | [topic] | Show help / available commands | Extension or core |
| `/status` | None | Show gateway status | Core diagnostics |
| `/config` | key value | View/set config (admin only) | Core config |
| `/reset` | None | Clear conversation history | Core session |
| `/model` | model_name | Switch AI model | Core agent |
| `/tools` | None | List available tools | Core agent |
| `/skills` | None | List available skills | Core skills |
| `/memory` | query | Search memory | Core memory |
| `/approve` | execution_id | Approve pending execution | Core approval |
| `/reject` | execution_id | Reject pending execution | Core approval |
| `/mute` | [duration] | Mute bot in this chat | Extension |
| `/unmute` | None | Unmute bot | Extension |
| `/privacy` | None | Show privacy policy | Extension |

## Command Routing

```
Inbound message with command
  |
  v
Auto-reply dispatcher
  |
  +-- Check if command is registered
  +-- If yes: execute command handler
  +-- If no: pass to agent as regular message
  |
  v
Command handler or Agent runtime
```

## Command Handler Registration

Commands can be registered by:
1. Core system (`src/commands/` or `src/agents/tools/`)
2. Extensions via plugin manifest

```typescript
// Plugin manifest (conceptual)
{
  "commands": [
    {
      "name": "mycommand",
      "description": "My custom command",
      "handler": "./commands/mycommand.js",
      "channels": ["telegram", "discord"]
    }
  ]
}
```

## Command Execution Flow

```
User sends: "/reset"
  |
  v
Telegram Extension parses command
  |
  v
Auto-reply system recognizes command
  |
  v
Command handler: ResetSessionCommand
  |
  +-- Verify user permission (if needed)
  +-- Clear session messages
  +-- Reset agent state
  +-- Send confirmation: "Conversation history cleared."
  |
  v
Reply sent via Telegram API
```

## Admin-Only Commands

Some commands may be restricted:

```typescript
function isAdmin(userId: string, chatId: string): boolean {
  // Check if user is chat admin
  // Or check against config.admins list
  return config.admins?.includes(userId) ?? false;
}

// Usage in command handler:
if (command.requiresAdmin && !isAdmin(senderId, chatId)) {
  return sendReply("This command requires admin privileges.");
}
```

## Inline Button Commands

Telegram supports inline keyboards (callback buttons):

```typescript
// Send message with inline buttons
{
  text: "Approve this action?",
  reply_markup: {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: "approve:exec_123" },
        { text: "❌ Reject", callback_data: "reject:exec_123" },
      ]
    ]
  }
}

// When user clicks:
// update.callback_query.data = "approve:exec_123"
// → Parse callback_data
// → Route to approval handler
// → Edit original message to show result
```

## Command Prefix Override

While Telegram standard is `/`, prefix can be configured:

```json
{
  "channels": {
    "telegram": {
      "commandPrefix": ["/", "!"]
    }
  }
}
```

Both `/start` and `!start` would be recognized.

## Command Help Generation

Help text auto-generated from registered commands:

```
/start - Start the bot
/help [topic] - Show this help
/status - Show gateway status
/model <name> - Switch AI model
/reset - Clear conversation history
```

## Command vs Agent Message

If a command is not recognized, it falls through to the agent:

```
User: "/dance"
Bot: "I don't recognize the /dance command. Let me ask the agent..."
→ Agent processes "/dance" as a regular message
→ Agent might respond: "I can't dance, but I can help you with..."
```

This prevents commands from blocking agent creativity.

## Error Handling

```
Command execution
  |
  v
Success → Reply with result
  |
  v
Error → Catch and reply with error message
  |
  +-- User-friendly error (for users)
  +-- Detailed error logged to diagnostics
```

## Key Files

- `extensions/telegram/src/` — Telegram command parsing
- `src/channels/message-normalization.ts` — Command extraction
- `src/auto-reply/` — Auto-reply dispatcher
- `src/commands/` — CLI command implementations (may share logic)
- `src/agents/tools/` — Tool system (commands may map to tools)

---

*Evidence: Telegram Bot API command documentation, `src/channels/message-normalization.ts`, `src/auto-reply/`, `src/commands/` structure, `src/agents/tools/` architecture.*
