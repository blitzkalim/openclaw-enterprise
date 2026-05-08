# WhatsApp — Webhook & Message Flow

## Purpose
Trace how WhatsApp messages flow through the system.

## Findings

### Inbound Flow

```
Baileys WebSocket connection (WhatsApp servers)
  -> extensions/whatsapp/src/channel.ts (onMessage handler)
    -> normalize WhatsApp message to ChannelMessageEnvelope
      -> src/channels/plugins/types.adapters.ts
        -> src/channels/plugins/account-helpers.ts (resolve account)
          -> src/security/dm-policy-shared.ts (check allowFrom / groupPolicy)
            -> src/auto-reply/reply/dispatcher-registry.ts (queue dispatch)
              -> src/agents/agent-command.ts (execute agent)
                -> LLM call (OpenAI / Anthropic / etc.)
                  -> src/agents/command/delivery.runtime.ts
                    -> extensions/whatsapp/src/channel.ts (sendMessage)
                      -> Baileys sendMessage()
                        -> WhatsApp servers
                          -> Recipient phone
```

### WebSocket vs Webhook

- WhatsApp extension uses **WebSocket** (Baileys), not HTTP webhooks
- Maintains persistent WebSocket connection to WhatsApp Web servers
- No external webhook URL needed
- Gateway does not expose inbound webhook for WhatsApp

### Message Normalization

- `extensions/whatsapp/src/message-parser.ts` — parses Baileys message objects
- Extracts: text, media, sender JID, group JID, timestamp
- JID format: `1234567890@s.whatsapp.net` (DM) or `1234567890-123456789@g.us` (group)
- Media downloaded via Baileys `downloadMediaMessage()`

### Outbound Flow

```
Agent reply text
  -> delivery.runtime.ts
    -> channel plugin send function
      -> Baileys sendMessage(jid, { text: "..." })
        -> WhatsApp WebSocket
```

### Typing Indicators

- Baileys supports `presenceSubscribe()` and `presenceUpdate()`
- Limited reliability — WhatsApp may throttle presence updates

### Group Handling

- Group JID parsed to extract group ID
- `groupPolicy` applied: `allowlist`, `open`, `disabled`
- Group name resolved from Baileys group metadata cache
- `@mentions` supported in group replies

## Evidence
- `extensions/whatsapp/src/channel.ts` — main channel handler
- `extensions/whatsapp/src/message-parser.ts` — message parsing
- `src/auto-reply/reply/dispatcher-registry.ts` — dispatch queue
- `src/agents/command/delivery.runtime.ts` — delivery

## Notes
- No webhook signature verification (not applicable — WebSocket protocol)
- Baileys connection may drop and reconnect automatically
- Group metadata updates are event-driven from Baileys
- Media download happens synchronously during normalization
