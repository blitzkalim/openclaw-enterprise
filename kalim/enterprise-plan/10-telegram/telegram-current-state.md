# Telegram — Current State

## Purpose
Deep audit of the Telegram channel extension.

## Findings

### Extension Info
- **Path**: `extensions/telegram/`
- **Package**: `@openclaw/telegram`
- **Version**: 2026.4.25
- **Channel ID**: `telegram`
- **Label**: Telegram (Bot API)
- **Detail Label**: Telegram Bot
- **Private**: true (not published to npm)

### Dependencies
- `grammy`: ^1.42.0 (modern Telegram Bot API framework)
- `@grammyjs/runner`: ^2.0.3 (concurrent update processing)
- `@grammyjs/transformer-throttler`: ^1.2.1 (rate limiting)
- `undici`: 8.1.0 (HTTP client)

### Authentication Model
- **Bot Token** from @BotFather
- `TELEGRAM_BOT_TOKEN` env var or config
- Token format: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`
- No webhook secret (Bot API uses token-based auth)

### Features
- Text messages (Markdown V2 / HTML)
- Images, videos, documents, audio
- Voice messages
- Inline keyboards / callback buttons
- Reply keyboards
- Commands (`/start`, `/help`, etc.)
- Group messages with @mention
- Reply threading
- Message reactions
- Edited message handling
- Channel messages (broadcasts)

### Configuration
```json5
{
  "channels": {
    "telegram": {
      "enabled": true,
      "accounts": ["mybot"],
      "allowFrom": ["*"],
      "dmPolicy": "pairing",
      "groupPolicy": "allowlist"
    }
  }
}
```

### Setup Features
- `configPromotion`: true (promotes bot token to config)
- `legacyStateMigrations`: true
- `markdownCapable`: true
- `nativeCommandsAutoEnabled`: true
- `nativeSkillsAutoEnabled`: true

### State Management
- Bot token stored in config or env
- No persistent auth state files (stateless Bot API)
- Webhook URL configured dynamically if using webhook mode
- Polling offset tracked in memory

## Evidence
- `extensions/telegram/package.json` — metadata
- `extensions/telegram/src/channel.ts` — channel implementation
- `extensions/telegram/index.ts` — entry point
- `extensions/telegram/setup-entry.ts` — setup wizard

## Notes
- Grammy framework provides modern TypeScript-first Bot API
- Supports both polling and webhook modes
- Rate limiting built-in via transformer-throttler
- Group chats require explicit allowlist
- Edited messages re-trigger agent (configurable)
