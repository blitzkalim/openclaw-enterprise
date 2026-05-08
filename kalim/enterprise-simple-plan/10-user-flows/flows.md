# 10 — User Flows

Three concrete flows. Each one walks through the system as it actually exists in this plan: cookie session → channel-router → existing OpenClaw runtime → reply.

---

## Flow 1 — "Add lead Rahul wants 2BHK" via WhatsApp

### Setup (one-time)

- The agency's admin runs `docker compose up`, logs in at `/login`, invites teammate **Amit**.
- Admin creates a **workspace** "Bandra Elite" (optional; assume default workspace for simplicity).
- Admin configures the workspace's WhatsApp bot (Meta Cloud API): app secret, phone number id, verify token. Saves them in `/team`.
- Webhook URL `https://oc.example.com/webhooks/whatsapp/<workspace_id>` is registered with Meta.
- **Amit** logs in, opens `/team`, clicks **"Link my WhatsApp"**, gets a claim code `OC-7K2X9Q`, sends `claim OC-7K2X9Q` from his phone (+91-98765-43210) to the agency's WhatsApp number.
- Webhook fires → router resolves claim → `INSERT INTO channel_identities (user_id=Amit, channel='whatsapp', external_id='+919876543210')` → reply: "Linked. You can message me normally now."

### Live flow

```
[1] Amit's phone → WhatsApp message: "Add lead Rahul wants 2BHK in Bandra"
                          │
                          ▼
[2] Meta Cloud API → POST https://oc.example.com/webhooks/whatsapp/<wsId>
       Headers: X-Hub-Signature-256: sha256=…
       Body: { messages: [{ from: '919876543210', text: { body: '…' } }] }
                          │
                          ▼
[3] Caddy → openclaw container :8080
                          │
                          ▼
[4] src/team/channel-router.ts
      a. Verify HMAC-SHA256 with workspace's app_secret  → ok
      b. Look up channel_identities (whatsapp, +919876543210)  → user_id = Amit
         (team.files already attached by auth middleware — resolveUserFiles ran at step [3])

[4b] src/team/file-resolver.ts  ← runs during auth, result already on req.team.files
      resolveUserFiles('amit-uuid'):
        ✓ ~/.openclaw/workspace/users/user_amit-uuid/ exists (or created now)
        ✓ SOUL.md        exists (seeded from base/SOUL.md   on first-ever request)
        ✓ AGENTS.md      exists (seeded from base/AGENTS.md on first-ever request)
        ✓ MEMORY.md      exists (empty on first request; agent-appended on later ones)
        ✓ USER.md        exists (empty on first request; agent-written profile)
        ✓ TASKS.md       exists (empty on first request; agent-written tasks)
        ✓ uploads/       exists
        ✓ conversations/ exists
        ✓ tmp/           exists (cleared this call)
        ✓ tool_cache/    exists
        ✓ logs/          exists
      returns: full UserFiles struct (10 fields, all absolute paths)

      c. Build sessionKey = "u:amit-uuid:wa:+919876543210"
      d. Build runtime request:
           { sessionKey, channel: 'whatsapp', text: 'Add lead Rahul wants 2BHK in Bandra',
             team: { userId: 'amit-uuid', workspaceId: 'be-uuid', isAdmin: false,
                     files: { soulPath, agentsPath, memoryPath, userProfilePath,
                              tasksPath, uploadsDir, conversationsDir,
                              tmpDir, toolCacheDir, logsDir } } }
                          │
                          ▼
[5] OpenClaw agent runtime (src/agents/agent-command.ts)  ← patched +25 lines
      - Loads session "u:amit-uuid:wa:+91…" from ~/.openclaw/sessions/
      - workspaceDir overridden to users/user_amit-uuid/   (team mode path)
      - Reads SOUL.md   via secureRead(userId, files.soulPath)     → boundary checked
      - Reads AGENTS.md via secureRead(userId, files.agentsPath)   → boundary checked
      - Reads MEMORY.md via secureRead(userId, files.memoryPath)   → prepended to prompt
      - Reads USER.md   via secureRead(userId, files.userProfilePath) → prepended
      - Reads TASKS.md  via secureRead(userId, files.tasksPath)    → prepended
      - LLM call: "Extract lead info from: 'Add lead Rahul wants 2BHK in Bandra'"
      - Tool call: skill `lead.create`
        → ctx.team.userId = 'amit-uuid'  → assigned_to = Amit
      - On session end: writes memory update via
        secureWrite(userId, files.memoryPath, newLine, { append: true }) → boundary checked
      - Streams back: "Got it — created lead 'Rahul', 2BHK, Bandra. Assigned to you."
                          │
                          ▼
[6] Existing extensions/whatsapp/ send path (or our outbound Meta client)
      → POST https://graph.facebook.com/v17.0/<phone_id>/messages
      → "Got it — created lead 'Rahul', 2BHK, Bandra. Assigned to you."
                          │
                          ▼
[7] Amit's WhatsApp shows the reply.
```

End-to-end latency: ~2–4 seconds (LLM-bound). All persistent state lives in `~/.openclaw/` on the EC2.

### What happened to the lead?

In this plan we **do not ship a lead-records table**. That's a real estate-specific feature. The big plan dedicates `/kalim/enterprise-plan/11-user-flows/flow-b-lead-capture.md` to it with a `leads` Postgres table. In the simple plan, leads live wherever the operator's chosen "lead" skill puts them — an Airtable, a Google Sheet, a JSON file in `~/.openclaw/`. The platform doesn't care; that's a skill / plugin concern.

---

## Flow 2 — PDF Upload via Telegram

```
[1] Customer Rahul → Telegram message to @BandraEliteBot
       Type: document, file_id="…", caption: "My pre-approval letter"
       (Customer is mapped via Mode-C "auto-create guest user", because
        the workspace is set up as a public-facing real-estate bot.)
                          │
                          ▼
[2] Telegram → POST https://oc.example.com/webhooks/telegram/<wsId>
       Headers: X-Telegram-Bot-Api-Secret-Token: <secret>
                          │
                          ▼
[3] src/team/channel-router.ts
       a. Verify secret token → ok
       b. external_id = chat.id (e.g. 8675309)
       c. channel_identities lookup → not found
       d. Workspace setting: auto_create_guest_users = true
          → INSERT INTO users (email='tg:8675309@guest.local', is_admin=0)
          → INSERT INTO channel_identities (user_id=<new>, channel='telegram',
              external_id='8675309')
       e. message.document.file_id present
          → team.files.uploadsDir = '~/.openclaw/workspace/users/user_<rahul>/uploads/'
          → fetch via Telegram getFile API, stream into uploadsDir/<file_id>.pdf
          → no shared media folder; file is scoped to this user's directory
       f. Build runtime request with attachment: { path: uploadsDir/<file_id>.pdf }
                          │
                          ▼
[4] OpenClaw agent runtime
       - Loads session "u:<rahul-guest>:tg:8675309"
       - Agent has the document-extract skill (existing extension); it OCRs
         the PDF, summarizes, extracts key facts (loan amount, bank, expiry)
       - Records summary into the session's vector memory  (LanceDB,
         partitioned by sessionKey → user-isolated automatically)
       - Replies: "Got your pre-approval letter from HDFC for ₹2.8 Cr,
           valid until 30 Jun. I'll keep this on file."
                          │
                          ▼
[5] Telegram sender (existing extensions/telegram/) replies in the chat.
```

If a teammate (Amit) later asks the agent in the dashboard "what's Rahul's pre-approval?", the agent **does not see it**, because vector memory is keyed by session id which is keyed by user. This is by design — guest customer data does not leak into Amit's conversational memory unless an explicit skill cross-references them (e.g. via the lead's external_id).

If we wanted the team to share lead memory, the right move is a skill that pulls from a shared store (Airtable, a JSON file, a `leads` table) — not a change to memory partitioning.

---

## Flow 3 — Two Users Interacting Concurrently

Setup: workspace has Amit and Priya, both linked their WhatsApp.

```
T+0.0s  Amit (+91-98765-43210)   → "Show me today's hot leads"
T+0.1s  Priya (+91-98765-99999)  → "Schedule site visit Sea View Sunday 10am"

[Webhook 1] router resolves Amit  → sessionKey "u:amit:wa:+91…" → agent
[Webhook 2] router resolves Priya → sessionKey "u:priya:wa:+91…" → agent

Both run concurrently in the same Node process.
- Their session files are different → no contention
- Their vector memory queries are scoped to different keys → no leak
- Their LLM calls are independent HTTP requests → upstream parallelism
- The shared agent config and shared skills are read-only at request time

T+1.5s  Amit ← "3 hot leads today: Rahul (Bandra 2BHK), Suresh (Andheri 3BHK), Neha…"
T+2.1s  Priya ← "Booked Sea View Residency for Rahul, Sunday 10am. Calendar event sent."

The two replies were generated in parallel, with completely separate
context, completely separate memory. Neither user saw the other's request.
```

### What if both reference the same lead?

If Amit and Priya are both editing "Rahul" (the lead is shared in some external store, e.g. Airtable):

- Amit's session memory has "Rahul, qualified, looking at Sea View."
- Priya's session memory has "Rahul, scheduled for site visit Sunday."
- The shared store (Airtable / Sheet / JSON) holds the canonical lead row, mutated by the skill on both sides.

Conflict resolution is the **skill's** problem (last-write-wins, optimistic locking, whatever). The platform doesn't try to coordinate. This is a sharp limit of the simple plan and is the natural next migration target if the team grows past it.

---

## Flow Properties Summary

| Property | Achieved by |
|---|---|
| Per-user isolated chat history | Session-key prefix `u:<userId>:` |
| Per-user isolated vector memory | Same — vector store keys on session id |
| Shared agent fleet | Agent config remains global |
| Shared channel infrastructure | One bot per workspace, sender mapped to user |
| Concurrent multi-user serving | Node event loop + independent session files |
| Webhook signature verification | HMAC for WhatsApp, secret-token header for Telegram |
| Guest customers (public bot) | Mode-C auto-create user; their identity is ephemeral |
| Audit trail of who did what | Logged to OpenClaw's existing logger (no audit table) |

These are exactly the flows a small real-estate team or a 5-person customer-support team needs. Anything more elaborate (lead routing rules, escalation queues, analytics) goes in skills/plugins, not the platform.

---

## Overlay File Resolution — How It Fits Into Every Flow

```
user request (WhatsApp / Telegram / HTTP)
  │
  ▼
auth resolves user_id
  │
  ▼
resolveUserFiles(user_id)          ← runs in auth middleware before any handler
  ├── ensure users/user_<id>/ root dir
  ├── SOUL.md        → copy base/SOUL.md   if missing
  ├── AGENTS.md      → copy base/AGENTS.md if missing
  ├── MEMORY.md      → create empty        if missing
  ├── USER.md        → create empty        if missing
  ├── TASKS.md       → create empty        if missing
  ├── uploads/       → create dir          if missing
  ├── conversations/ → create dir          if missing
  ├── tmp/           → create dir + clear  each session
  ├── tool_cache/    → create dir          if missing
  └── logs/          → create dir          if missing
  │
  ▼
agent runtime executes with fully isolated context
  ├── reads  SOUL.md        from team.files.soulPath          (this user only)
  ├── reads  AGENTS.md      from team.files.agentsPath        (this user only)
  ├── reads  MEMORY.md      from team.files.memoryPath        (this user only)
  ├── reads  USER.md        from team.files.userProfilePath   (this user only)
  ├── reads  TASKS.md       from team.files.tasksPath         (this user only)
  ├── reads  skills         from base/skills/                 (shared — read-only)
  ├── reads  tools          from base/tools/                  (shared — read-only)
  ├── writes uploads         to team.files.uploadsDir          (this user only)
  ├── writes conversations/  to team.files.conversationsDir   (this user only)
  ├── writes tmp/            to team.files.tmpDir              (this user only)
  ├── writes tool_cache/     to team.files.toolCacheDir        (this user only)
  ├── writes logs/           to team.files.logsDir             (this user only)
  └── writes base/           NEVER — base/ is permanently read-only
```

**Result with 3 concurrent users (Amit, Priya, Rahul):**

```
~/.openclaw/workspace/
  base/                       ← READ-ONLY at runtime
    SOUL.md                   ← operator edits; seeds new users
    AGENTS.md
    skills/
    tools/
  users/
    user_amit/                ← ALL Amit's runtime writes go here
      SOUL.md                 ← Amit's copy; may diverge
      AGENTS.md
      MEMORY.md               ← Amit's cross-session context
      USER.md                 ← Amit's profile / preferences
      TASKS.md                ← Amit's pending tasks
      uploads/                ← Amit's inbound files
      conversations/          ← Amit's session transcripts
      tmp/                    ← Amit's scratch (cleared each session)
      tool_cache/             ← Amit's cached tool results
      logs/                   ← Amit's execution logs
    user_priya/               ← ALL Priya's runtime writes go here
      SOUL.md
      AGENTS.md
      MEMORY.md
      USER.md
      TASKS.md
      uploads/
      conversations/
      tmp/
      tool_cache/
      logs/
    user_rahul/               ← ALL Rahul's runtime writes go here
      SOUL.md
      AGENTS.md
      MEMORY.md
      USER.md
      TASKS.md
      uploads/
      conversations/
      tmp/
      tool_cache/
      logs/
```

No user can read or affect another user's files. `base/` is shared and permanently read-only at runtime. Skills and tools upgrade in one place. Zero workspace duplication.
