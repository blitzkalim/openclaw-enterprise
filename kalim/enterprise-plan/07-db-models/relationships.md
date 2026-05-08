# Relationships

## Entity Relationship Diagram (Simplified)

```
Config (openclaw.json)
  ├── Gateway Auth { token, password, mode }
  ├── Agents { defaults, skills }
  ├── Channels { [channelId] -> ChannelConfig }
  ├── Cron { jobs[] -> CronJob }
  └── Tools { enabled[] }

Session (sessions/*.json)
  ├── sessionKey -> (channel:account:agent)
  ├── messages[] -> Message
  └── metadata -> { model, provider, agentId }

Task (tasks.sqlite)
  ├── id
  ├── sessionKey -> Session
  ├── agentId -> AgentConfig
  └── status -> lifecycle

Pairing (pairing/*.json)
  ├── provider -> ChannelId
  ├── accountId -> ChannelAccount
  └── allowFrom[] -> ApprovedSenders
```

## Key Relationships

1. **Config -> Channels**
   - One-to-many: one config -> many channel configs
   - Channel plugins read their config subtree at runtime

2. **Config -> Agents**
   - `agents.defaults` applies to all agents unless overridden
   - One-to-many: defaults -> agent instances

3. **Session -> Channel + Account + Agent**
   - Session key encodes: `channelId:accountId:agentId`
   - Each session bound to exactly one channel account and one agent
   - Many-to-many: channels x accounts x agents = sessions

4. **Task -> Session**
   - Tasks reference session key for context
   - One-to-many: one session -> many tasks over time

5. **Cron Job -> Agent**
   - Cron payload specifies agent command
   - One-to-one: each cron job targets one agent behavior

6. **Device -> Gateway**
   - Device tokens authenticate nodes to gateway
   - One-to-many: one gateway -> many paired devices

7. **Message -> Session**
   - Messages stored within session transcript
   - Many-to-one: many messages -> one session

## Evidence
- `src/config/schema.base.generated.ts`
- `src/sessions/session-store.ts`
- `src/tasks/task-registry.types.ts`
- `src/cron/types.ts`
- `src/routing/session-key.ts`

## Notes
- No foreign key constraints — relationships are logical, not enforced by DB
- Session key is the primary join key across subsystems
- Orphaned references possible if files corrupted
