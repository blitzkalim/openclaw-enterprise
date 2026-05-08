# 09 — User Flows

Same three flows from the simple plan, annotated with **which Pod handles each step**.

---

## Flow 1 — "Add lead Rahul wants 2BHK" via WhatsApp

### Setup (One-Time)

1. Admin runs `helm install openclaw charts/openclaw/` → all Pods start
2. Bootstrap Job creates admin user in Postgres, uploads `base/SOUL.md` + `base/AGENTS.md` to S3
3. Admin visits `https://oc.example.com/login` → **Gateway Pod** serves login page
4. Admin logs in → **Gateway Pod** queries Postgres, issues JWT cookie
5. Admin opens `/team`, invites teammate **Amit** → **Gateway Pod** inserts user row in Postgres
6. Admin configures WhatsApp bot (Meta Cloud API): app secret, phone number ID, verify token → **Gateway Pod** encrypts and stores in Postgres `workspace_secrets`
7. Webhook URL `https://oc.example.com/webhooks/whatsapp/<wsId>` registered with Meta
8. **Amit** logs in, opens `/team`, clicks "Link my WhatsApp", gets claim code `OC-7K2X9Q`
   → **Gateway Pod** stores claim in Postgres + Redis (`claim:OC-7K2X9Q`)
9. Amit sends `claim OC-7K2X9Q` from phone (+91-98765-43210) to agency's WhatsApp number
   → Meta webhook → **Gateway Pod** verifies HMAC, redeems claim, inserts `channel_identities` row
   → Enqueues "claim success" reply job → **Agent Worker** sends "Linked" message

### Live Flow

```
[1] Amit's phone → WhatsApp message: "Add lead Rahul wants 2BHK in Bandra"
         │
         ▼
[2] Meta Cloud API → POST https://oc.example.com/webhooks/whatsapp/<wsId>
         │
         ▼  ┌──────────────────────────────────────────────────────┐
[3]      │  │  GATEWAY POD                                         │
         │  │                                                      │
         │  │  a. Ingress routes to gateway service :8080           │
         │  │  b. channel-router.ts receives POST                   │
         │  │  c. Read raw body (before JSON parse)                 │
         │  │  d. Compute HMAC-SHA256(rawBody, app_secret)          │
         │  │     app_secret decrypted from Postgres workspace_secrets│
         │  │  e. crypto.timingSafeEqual(computed, header) → ✓      │
         │  │  f. Parse JSON body                                   │
         │  │  g. Extract from="+919876543210", text                │
         │  │  h. Query Postgres:                                   │
         │  │     SELECT user_id FROM channel_identities            │
         │  │     WHERE channel='whatsapp' AND external_id='+91...' │
         │  │     → user_id = 'amit-uuid'                           │
         │  │  i. Build job payload:                                │
         │  │     { userId: 'amit-uuid',                            │
         │  │       sessionKey: 'u:amit-uuid:wa:+919876543210',     │
         │  │       channel: 'whatsapp',                            │
         │  │       threadId: '+919876543210',                      │
         │  │       text: 'Add lead Rahul wants 2BHK in Bandra',   │
         │  │       replyChannel: 'agent:reply:whatsapp:+91...' }   │
         │  │  j. Enqueue to BullMQ queue 'agent-jobs' via Redis    │
         │  │  k. Return 200 to Meta (async processing)             │
         │  └──────────────────────────────────────────────────────┘
         │
         ▼  ┌──────────────────────────────────────────────────────┐
[4]      │  │  AGENT WORKER POD (BullMQ consumer)                   │
         │  │                                                      │
         │  │  a. Dequeue job from 'agent-jobs'                     │
         │  │  b. File resolution (S3-backed resolveUserFiles):     │
         │  │     - Check S3: users/user_amit-uuid/SOUL.md exists?  │
         │  │       First time: copy base/SOUL.md → user copy       │
         │  │     - Same for AGENTS.md                              │
         │  │     - Ensure MEMORY.md, USER.md, TASKS.md exist      │
         │  │       (create empty if missing)                       │
         │  │     - Download all 5 files to /tmp/agent-scratch/     │
         │  │  c. Build TeamCtx with resolved file paths            │
         │  │  d. Call agent-command.ts:                             │
         │  │     - secureRead(userId, soulPath) → SOUL.md content  │
         │  │     - secureRead(userId, agentsPath) → AGENTS.md      │
         │  │     - secureRead(userId, memoryPath) → MEMORY.md      │
         │  │     - secureRead(userId, userProfilePath) → USER.md   │
         │  │     - secureRead(userId, tasksPath) → TASKS.md        │
         │  │     - LLM call: "Extract lead info: 'Add lead...'"    │
         │  │     - Tool call: skill lead.create                    │
         │  │       ctx.team.userId = 'amit-uuid'                   │
         │  │  e. Write back:                                       │
         │  │     - secureWrite MEMORY.md → upload to S3            │
         │  │     - secureWrite transcript → upload to S3           │
         │  │     - secureWrite execution log → upload to S3        │
         │  │  f. Publish reply to Redis:                           │
         │  │     channel: 'agent:reply:whatsapp:+919876543210'     │
         │  │     data: "Got it — created lead 'Rahul', 2BHK..."   │
         │  │  g. Mark job complete in BullMQ                       │
         │  └──────────────────────────────────────────────────────┘
         │
         ▼  ┌──────────────────────────────────────────────────────┐
[5]      │  │  GATEWAY POD (channel-reply.ts subscriber)            │
         │  │                                                      │
         │  │  a. Subscribed to agent:reply:* via Redis Pub/Sub     │
         │  │  b. Receives reply message                            │
         │  │  c. channel = 'whatsapp' → call Meta Cloud API:      │
         │  │     POST graph.facebook.com/v17.0/<phoneId>/messages  │
         │  │     body: "Got it — created lead 'Rahul', 2BHK,      │
         │  │            Bandra. Assigned to you."                  │
         │  └──────────────────────────────────────────────────────┘
         │
         ▼
[6] Amit's WhatsApp shows the reply.
```

**End-to-end latency:** ~2–5 seconds (LLM-bound + queue overhead ~100ms). The webhook response to Meta is <50ms (enqueue only).

---

## Flow 2 — PDF Upload via Telegram

```
[1] Customer Rahul → Telegram message to @BandraEliteBot
       Type: document, file_id="…", caption: "My pre-approval letter"
       (Workspace configured as Mode-C: auto-create guest users)
         │
         ▼
[2] Telegram → POST https://oc.example.com/webhooks/telegram/<wsId>

─── GATEWAY POD ───────────────────────────────────────────────────
[3] channel-router.ts:
       a. Verify X-Telegram-Bot-Api-Secret-Token → ✓
       b. external_id = String(chat.id) → "8675309"
       c. Query Postgres: channel_identities → NOT FOUND
       d. Workspace setting: auto_create_guest_users = true
          → INSERT INTO users (email='tg:8675309@guest.local', is_admin=false)
          → INSERT INTO channel_identities (user_id=<new>, channel='telegram',
              external_id='8675309')
       e. Document attached:
          → Download from Telegram getFile API
          → Upload to S3: users/user_<rahul>/uploads/<timestamp>_<fileId>.pdf
            (path validated via validateS3WriteKey before upload)
          → Record S3 key as attachment ref
       f. Enqueue to BullMQ:
          { userId: '<rahul-guest>', sessionKey: 'u:<rahul>:tg:8675309',
            text: 'My pre-approval letter',
            attachments: [{ s3Key: '...', mimeType: 'application/pdf' }] }
       g. Return 200 to Telegram

─── AGENT WORKER POD ──────────────────────────────────────────────
[4] job-processor.ts:
       a. Dequeue job
       b. Resolve user files from S3 (first-time: seed from base/)
       c. Download attachment from S3 to /tmp/agent-scratch/
       d. Agent runtime:
          - Document-extract skill OCRs the PDF
          - Summarizes: loan amount, bank, expiry
          - Records summary in vector memory
            (LanceDB, partitioned by sessionKey → user-isolated)
       e. Write back: MEMORY.md, transcript, log → S3
       f. Publish reply: "Got your pre-approval letter from HDFC
          for ₹2.8 Cr, valid until 30 Jun."

─── GATEWAY POD ───────────────────────────────────────────────────
[5] channel-reply.ts:
       → Receives pub/sub message
       → Telegram sendMessage API → reply in chat
```

**Isolation guarantee:** If teammate Amit later asks the agent "what's Rahul's pre-approval?", the agent **does not see it** — vector memory is keyed by session id which is keyed by user. Guest customer data does not leak.

---

## Flow 3 — Two Users Interacting Concurrently

Setup: workspace has Amit and Priya, both linked their WhatsApp.

```
T+0.0s  Amit  (+91-98765-43210) → "Show me today's hot leads"
T+0.1s  Priya (+91-98765-99999) → "Schedule site visit Sea View Sunday 10am"

─── GATEWAY POD ───────────────────────────────────────────────────
T+0.0s  Webhook 1 received → verify HMAC → resolve Amit
        → enqueue job { sessionKey: 'u:amit:wa:+91...', text: '...' }

T+0.1s  Webhook 2 received → verify HMAC → resolve Priya
        → enqueue job { sessionKey: 'u:priya:wa:+91...', text: '...' }

Both enqueued to 'agent-jobs' queue within 100ms. Gateway returns 200 to
Meta for both. Gateway did NOT wait for agent processing.

─── AGENT WORKER POD(S) ──────────────────────────────────────────
Scenario A: Same worker replica picks up both jobs sequentially
  → Job 1 (Amit): resolve files from S3, execute agent, write back
  → Job 2 (Priya): resolve files from S3, execute agent, write back
  → Total: ~4–8 seconds

Scenario B: Two different worker replicas pick up jobs in parallel
  → Worker 1 processes Amit's job
  → Worker 2 processes Priya's job
  → Total: ~2–4 seconds (fully parallel)

In BOTH scenarios:
  ✓ Their S3 file paths are different → no collision
  ✓ Their session keys are different → no memory leak
  ✓ Their LLM calls are independent → upstream parallelism
  ✓ Their vector memory queries are scoped by key → no cross-user data
  ✓ Shared skills/tools read from base/ → read-only, no contention

─── GATEWAY POD ───────────────────────────────────────────────────
T+2.0s  Reply for Amit published to agent:reply:whatsapp:+91-98765-43210
        → Gateway sends via Meta API
        → Amit's WhatsApp: "3 hot leads today: Rahul (2BHK)..."

T+2.5s  Reply for Priya published to agent:reply:whatsapp:+91-98765-99999
        → Gateway sends via Meta API
        → Priya's WhatsApp: "Booked Sea View for Rahul, Sunday 10am."

Neither user saw the other's request. Completely independent execution.
```

### Key Difference from Simple Plan

In the simple plan, concurrent requests run in the same Node event loop (reentrant but single-threaded). In the final plan, concurrent requests can be processed by **different worker replicas in parallel** — true parallelism, not just concurrency.

---

## Flow 4 — WebSocket Agent Streaming (Browser UI)

```
[1] Amit opens browser → https://oc.example.com
       → JWT cookie present from prior login

─── GATEWAY POD ───────────────────────────────────────────────────
[2] Browser opens WebSocket: WSS /ws?token=<JWT>
       a. Gateway validates JWT (JWKS, local verify)
       b. Check Redis: EXISTS session:<jti> → ✓
       c. WebSocket connection established
       d. Gateway subscribes to Redis pub/sub:
          agent:stream:u:amit-uuid:web:<browserSessionId>

[3] Amit types: "What's Rahul's latest status?"
       a. Gateway receives WS message
       b. Enqueue job to BullMQ:
          { userId: 'amit-uuid', channel: 'web',
            sessionKey: 'u:amit-uuid:web:<browserSessionId>',
            text: "What's Rahul's latest status?",
            replyChannel: 'agent:stream:u:amit-uuid:web:<browserSessionId>' }

─── AGENT WORKER POD ──────────────────────────────────────────────
[4] Dequeue job, execute agent
       As LLM tokens stream:
         → Publish each token to Redis pub/sub:
           channel: agent:stream:u:amit-uuid:web:<browserSessionId>
           data: { type: 'token', data: 'Rahul' }
           data: { type: 'token', data: ' is' }
           data: { type: 'token', data: ' a qualified' }
           ...
         → Final: { type: 'done', data: '' }

─── GATEWAY POD ───────────────────────────────────────────────────
[5] Redis pub/sub messages arrive
       → Gateway relays each to Amit's WebSocket
       → Browser renders streaming text in real-time

Total: first token in ~500ms, full response in ~2–3s (LLM streaming)
```

---

## Flow Properties Summary

| Property | How Achieved | Pod(s) Involved |
|---|---|---|
| Per-user isolated chat history | Session-key prefix `u:<userId>:` | Agent Worker |
| Per-user isolated vector memory | Same — vector store keys on session id | Agent Worker |
| Per-user isolated files | S3 prefix `users/user_<id>/` + secureRead/secureWrite | Agent Worker |
| Shared agent fleet | Agent config from `base/` (S3) | Agent Worker |
| Shared channel infrastructure | One bot per workspace, sender mapped to user | Gateway |
| Concurrent multi-user serving | BullMQ queue with multiple worker replicas | Gateway → Agent Worker(s) |
| Webhook signature verification | HMAC/secret-token check at Gateway | Gateway |
| Guest customers (public bot) | Mode-C auto-create user | Gateway |
| Real-time streaming | Redis Pub/Sub relay through WebSocket | Agent Worker → Gateway |
| Webhook response time | <50ms (enqueue, don't wait) | Gateway |
| Audit trail | Logged to S3 per-user logs/ and OpenClaw logger | Agent Worker |
