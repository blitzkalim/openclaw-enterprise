# EPIC 4 — Channel Routing (WhatsApp + Telegram)

> Source: `05-channel-routing/routing.md`, `10-user-flows/flows.md`. Two webhook endpoints, three sender-mapping modes, file streaming into per-user `uploadsDir`.

---

## STORY 4.1 — Telegram Webhook Endpoint with Secret-Token Verification

### 🎯 Description
Register `POST /webhooks/telegram/:workspaceId`. Verify the `X-Telegram-Bot-Api-Secret-Token` header matches the per-workspace secret. Parse the Telegram update, extract `external_id = String(message.chat.id)`, look up `channel_identities`, and dispatch to the existing OpenClaw runtime via `team` ctx.

Source: `05-channel-routing/routing.md` "Telegram".

### ⚙️ Implementation Details

**File**: `src/team/channel-router.ts` (NEW, ~90 of the ~150 lines for this story).

**Flow**:
1. Read raw body.
2. Verify header secret (constant-time compare).
3. JSON-parse body.
4. Extract `chat.id`, `from.first_name`, message body / document / photo / location.
5. `findChannelIdentity('telegram', String(chat.id))`.
6. If found → dispatch with `team.userId`. If not → claim flow (Story 4.5) or auto-create guest (Story 4.6) or drop (default).

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Implement the Telegram webhook handler in src/team/channel-router.ts.

REQUIREMENTS
1. Export `mountChannelRouter(app)` which registers POST /webhooks/telegram/:workspaceId.
2. The handler MUST read the raw request body (Buffer) before any JSON parsing — the existing OpenClaw HTTP server may have body-parsing middleware; opt out for these webhook routes (raw bytes only).
3. Verify the header `x-telegram-bot-api-secret-token`:
   - Look up the workspace's stored secret (will come from a small `workspace_secrets` table or — quicker for v1 — from a JSON config file at `~/.openclaw/team/workspaces/<wsId>.json`. Pick whichever the codebase already has plumbing for; otherwise use a new SQLite table `workspace_channels(workspace_id, channel, secret_encrypted)`).
   - timingSafeEqual; on mismatch → 401, log, drop.
4. JSON.parse the raw body inside a try/catch; on bad JSON → 400.
5. Extract:
       const update = JSON.parse(rawBody);
       const message = update.message || update.edited_message;
       if (!message) return 200 OK (callbacks/edits we ignore for v1).
       const externalId = String(message.chat.id);
       const text       = message.text ?? message.caption ?? null;
6. Look up identity via findChannelIdentity('telegram', externalId).
7. If found:
       - Build sessionKey via deriveSessionKey({ channel: 'tg', threadId: externalId, team: { userId: identity.user_id } }).
       - Resolve files via resolveUserFiles(identity.user_id) (or rely on a fresh resolveTeamAuth-style call — for webhooks we don't have a cookie, so call resolveUserFiles directly).
       - Call dispatch({ team, channel: 'telegram', threadId: externalId, text, attachments: [...] }) — see story 4.4.
   If not found:
       - If text starts with /^claim\s+OC-/ → invoke claim handler (story 4.5).
       - Else if workspace has auto_create_guest_users === true → auto-create (story 4.6).
       - Else: log unknown sender, return 200 (don't reply to strangers).
8. Always return 200 OK to Telegram on success (Telegram retries on non-2xx).
9. Document: the user must register the webhook with Telegram via setWebhook + secret_token at workspace creation time (handled by team UI, story 7.x).

CONSTRAINTS
- No grammy import — we hit Telegram's HTTP API directly when sending replies (the existing extensions/telegram/ already does this; reuse its sendMessage helper if exported, otherwise inline a minimal POST).
- Raw body capture is required for HMAC consistency with WhatsApp; do it once for both routes.
- All file writes go through secureWrite (story 5.2) — never bare fs.

OUTPUT
- src/team/channel-router.ts (full file, may include WhatsApp handler too — split or co-locate)
```

### 🧪 Testing Instructions
1. Register a test workspace with a known secret in the workspace store.
2. POST `/webhooks/telegram/<wsId>` with correct `x-telegram-bot-api-secret-token` and a `message` body → 200.
3. Same POST with wrong secret → 401.
4. Body `{}` (no message) → 200 (ignored).
5. Bad JSON → 400.
6. Known sender (channel_identities row exists) → dispatch called with the right userId.
7. Unknown sender → no reply, 200, log entry written.

### 📥 Example Input
```http
POST /webhooks/telegram/be-uuid
Content-Type: application/json
X-Telegram-Bot-Api-Secret-Token: abc123secret

{"update_id":1,"message":{"message_id":42,"from":{"id":8675309,"first_name":"Rahul"},"chat":{"id":8675309,"type":"private"},"text":"Hi"}}
```

### 📤 Expected Output
HTTP 200 + dispatch invoked with `team.userId = identity.user_id`.

### ✅ Acceptance Criteria
- [ ] Handler registered only in team mode.
- [ ] Secret-token verified before any parse.
- [ ] Known sender dispatches; unknown sender drops.
- [ ] Always returns 200 to Telegram unless auth fails.

---

## STORY 4.2 — WhatsApp Webhook with HMAC-SHA256 Verification (Meta Cloud API)

### 🎯 Description
Register `POST /webhooks/whatsapp/:workspaceId`. Verify `X-Hub-Signature-256: sha256=<hex>` against `HMAC(rawBody, app_secret)`. Parse the Meta Cloud envelope, extract the inbound message, dispatch identically to Telegram path.

Source: `05-channel-routing/routing.md` "WhatsApp (Meta Cloud API only)".

### ⚙️ Implementation Details

**File**: `src/team/channel-router.ts`.

**Flow**:
1. Verify GET handler for the initial Meta verification handshake (`hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`) — return the challenge string when verify_token matches.
2. POST: read raw body → compute HMAC-SHA256 with stored `app_secret` → constant-time compare to header.
3. Parse `entry[0].changes[0].value.messages[0]` (and `contacts[0]`).
4. `external_id = '+' + value.contacts[0].wa_id`.
5. Same downstream flow as Telegram.

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Implement WhatsApp Meta Cloud API webhook handler in src/team/channel-router.ts.

REQUIREMENTS
1. GET /webhooks/whatsapp/:workspaceId:
   - Read query params: hub.mode, hub.verify_token, hub.challenge.
   - Lookup the workspace's verify_token in the workspace channel store.
   - If hub.mode === 'subscribe' AND timingSafeEqual(verify_token, stored): return 200 with hub.challenge as plain text body.
   - Else: 403.
2. POST /webhooks/whatsapp/:workspaceId:
   - Read raw body as Buffer.
   - Read header x-hub-signature-256 (format: 'sha256=' + 64 hex chars).
   - Compute HMAC-SHA256(rawBody, app_secret) → hex.
   - timingSafeEqual against the header value (after stripping 'sha256=' prefix).
   - On mismatch → 401 + log; do NOT proceed to parsing.
3. Parse JSON body.
4. Walk `entry[0].changes[0].value`. If `messages` array empty (e.g. status update), return 200.
5. Extract:
       const msg = value.messages[0];
       const contact = value.contacts?.[0];
       const externalId = '+' + (contact?.wa_id ?? msg.from);  // E.164
       const displayName = contact?.profile?.name ?? null;
       const text = msg.type === 'text' ? msg.text.body : (msg.image?.caption ?? msg.document?.caption ?? null);
6. If msg.type === 'document' or 'image':
       - Call Meta media-download endpoint: GET https://graph.facebook.com/v17.0/<media-id> → returns { url }; then GET that URL with Bearer access_token to download bytes.
       - secureWrite to `${team.files.uploadsDir}/${Date.now()}_${msg.id}.${ext}` (validate path first).
       - Add { path: destPath, mimeType } to the dispatch attachments.
7. Identity lookup + dispatch, identical to Telegram.
8. Reply path: outbound to Meta Cloud API → POST https://graph.facebook.com/v17.0/<phone_number_id>/messages with `Authorization: Bearer <access_token>` and the appropriate JSON envelope.

CONSTRAINTS
- Constant-time HMAC compare.
- Raw body MUST be the exact bytes Meta sent; do not whitespace-normalize.
- Dedupe by msg.id (LRU of last 100 ids per workspace) to handle Meta retries.
- Reply outbound calls should not block the webhook response — return 200 immediately, then send asynchronously. (Meta retries non-2xx.)

OUTPUT
- The WhatsApp handler section of src/team/channel-router.ts.
- A small helper module src/team/wa-meta-client.ts for outbound + media download.
```

### 🧪 Testing Instructions
1. GET `/webhooks/whatsapp/<wsId>?hub.mode=subscribe&hub.verify_token=correct&hub.challenge=42` → returns `42`.
2. Same with wrong verify_token → 403.
3. POST with valid HMAC → 200, dispatch invoked.
4. POST with tampered body (HMAC stale) → 401.
5. POST with `messages[0].type=document` → file downloaded into user's `uploadsDir`, `attachments[].path` is the absolute local path.
6. Two identical POSTs (Meta retry) → second is deduped, dispatch called once.

### 📥 Example Input (text message)
```http
POST /webhooks/whatsapp/be-uuid
Content-Type: application/json
X-Hub-Signature-256: sha256=<hex>

{"object":"whatsapp_business_account","entry":[{"id":"X","changes":[{"value":{"messaging_product":"whatsapp","contacts":[{"profile":{"name":"Rahul"},"wa_id":"919876543210"}],"messages":[{"from":"919876543210","id":"wamid.X","type":"text","text":{"body":"Hi"}}]}}]}]}
```

### 📤 Expected Output
HTTP 200; dispatch invoked with `team.userId = identity.user_id`, `text='Hi'`.

### ✅ Acceptance Criteria
- [ ] GET handshake works.
- [ ] HMAC verified before parsing.
- [ ] Document/image media downloaded into per-user `uploadsDir` via secureWrite.
- [ ] Dedupe prevents duplicate dispatch on retries.
- [ ] Outbound reply uses the workspace's stored access token.

---

## STORY 4.3 — Channel-Identity Mapping Table & Repos

### 🎯 Description
Already defined in EPIC 1 (Story 1.2). This story exists to confirm the exposed repo functions and add a small admin endpoint to list/delete mappings.

### ⚙️ Implementation Details

**File**: `src/team/team-routes.ts` (extends).

Routes:
- `GET /team/identities` — current user's mappings.
- `DELETE /team/identities/:id` — current user's only.
- `POST /team/identities` (admin only) — `{ userId, channel, externalId }` to admin-assign.

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Add three routes for channel-identity self-management.

REQUIREMENTS
1. GET /team/identities → return mappings for ctx.userId.
2. DELETE /team/identities/:id → only delete if user_id === ctx.userId.
3. POST /team/identities (admin only):
   - Body: { userId, channel: 'whatsapp'|'telegram', externalId, displayName? }
   - Reject if not isAdmin → 403.
   - createChannelIdentity; on UNIQUE violation → 409.

CONSTRAINTS
- All require auth.
- POST is admin-only (Mode B from §05).

OUTPUT
- The added routes in src/team/team-routes.ts.
```

### 🧪 Testing Instructions
1. List own → returns own mappings only.
2. Try to DELETE another user's mapping id → 404.
3. Non-admin tries POST → 403.
4. Admin POST with duplicate (channel, externalId) → 409.

### ✅ Acceptance Criteria
- [ ] Self-list / self-delete work.
- [ ] Cross-user delete blocked.
- [ ] Admin assign works; duplicates rejected.

---

## STORY 4.4 — Implement `dispatch()` to OpenClaw Runtime

### 🎯 Description
The shared dispatcher both webhooks call. Builds the `team` context (with `files`), constructs the session key, and calls into the existing OpenClaw runtime entry point that channel extensions already use.

Source: `05-channel-routing/routing.md` "The Forwarding Path Into Existing OpenClaw".

### ⚙️ Implementation Details

**File**: `src/team/channel-router.ts` (the `dispatch` function, ~30 lines).

```ts
async function dispatch(args: { userId, workspaceId, channel, threadId, text, attachments }) {
  const files = await resolveUserFiles(args.userId);
  const team  = { userId: args.userId, workspaceId: args.workspaceId, isAdmin: false, source: 'webhook', files };
  const sessionKey = deriveSessionKey({ channel: args.channel, threadId: args.threadId, team });
  await openclawRuntime.handleInbound({ sessionKey, channel: args.channel, text: args.text, attachments: args.attachments, team });
}
```

`openclawRuntime.handleInbound` is the existing entry point — find it in the OpenClaw codebase (probably exported by `src/agents/agent-command.ts` or a sibling).

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Implement the shared dispatch fn in src/team/channel-router.ts.

REQUIREMENTS
1. Signature: async function dispatch({ userId, workspaceId, channel, threadId, text, attachments }): Promise<void>
2. Body:
   const files = await resolveUserFiles(userId);
   const team  = { userId, workspaceId: workspaceId ?? null, isAdmin: false, source: 'webhook' as const, files };
   const sessionKey = deriveSessionKey({ channel, threadId, team });
   await runOpenclawAgent({ sessionKey, channel, threadId, text, attachments, team });
3. runOpenclawAgent: import the existing OpenClaw entrypoint. Search the codebase for the function that channel extensions already call when an inbound message lands (likely in src/agents/agent-command.ts; named handleInbound, processInbound, runAgentTurn, or similar). If unsure, expose a thin facade in src/agents/index.ts that channel-router imports.
4. Wrap the call in try/catch; on error, log to logsDir via secureWrite (a JSON line with timestamp + error stack); rethrow.

CONSTRAINTS
- Do not duplicate logic from existing channel extensions; reuse their send-out path for the reply.
- Channel-specific reply emission stays out of dispatch (handled by the existing channel sender or the wa-meta-client.ts).

OUTPUT
- The dispatch fn (and runOpenclawAgent if a facade is needed).
```

### 🧪 Testing Instructions
1. Mock `runOpenclawAgent` and assert it receives the expected args, including `team.files` with all 10 paths.
2. Resolve fails → error logged into the user's `logsDir`, error rethrown to caller.
3. Two concurrent dispatches for different users → both succeed independently.

### ✅ Acceptance Criteria
- [ ] Always provides `team.files` to the runtime.
- [ ] Errors logged to per-user `logsDir`.
- [ ] No coupling to a specific channel.

---

## STORY 4.5 — Mode A: Claim-Code Flow

### 🎯 Description
Allow users to link their phone/telegram_id by sending `claim OC-<code>` from the device. The router parses the message, calls `consumeChannelClaim`, creates the `channel_identity`, and replies "Linked".

Source: `05-channel-routing/routing.md` "Mode A — Pre-claimed".

### ⚙️ Implementation Details

**Files**:
- `src/team/team-routes.ts` — `POST /team/identities/claim` to issue a code (returns `OC-XXXXXX` to user UI).
- `src/team/channel-router.ts` — handle `^claim\s+OC-` regex inside webhook.

```
POST /team/identities/claim
  body: { channel: 'whatsapp' | 'telegram' }
  → createChannelClaim(userId, channel, ttlSeconds=600)
  → return { code, expiresAt }

Inbound webhook with text matching /^claim\s+(OC-[A-Z0-9]+)/i:
  → consumeChannelClaim(code) → { userId, channel } | null
  → if null: reply "Invalid or expired code" (only when sender just sent claim text — don't echo to strangers otherwise).
  → if ok:
       createChannelIdentity({ user_id: userId, channel, external_id: <sender>, display_name })
       reply "Linked. You can now message me normally."
```

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Implement the claim flow.

REQUIREMENTS
1. src/team/team-routes.ts:
   - POST /team/identities/claim with auth.
   - Body: { channel: 'whatsapp'|'telegram' }
   - Reject other channel values with 400.
   - Generate code: 'OC-' + 6 chars from base32 alphabet (no I, L, O, 0, 1 — to avoid confusion).
   - createChannelClaim(userId, channel, ttlSeconds=600).
   - Return { code, expiresAt }.
2. src/team/channel-router.ts:
   - When inbound text matches /^claim\s+(OC-[A-HJ-NP-Z2-9]{6})\s*$/i:
       - Extract the code.
       - consumeChannelClaim(code) → returns { user_id, channel } | null.
       - If null OR channel doesn't match the inbound channel: reply "Invalid or expired claim code." (via channel-specific send path).
       - Else:
           - createChannelIdentity({ user_id, channel, external_id, display_name, workspace_id: <from claim or workspace>}).
           - On UNIQUE violation: reply "This <channel> account is already linked.".
           - Else reply "Linked! You can now message me normally."
   - On the regex non-match path with unknown sender → drop (existing default).

CONSTRAINTS
- consumeChannelClaim must be atomic (UPDATE … WHERE consumed_at IS NULL AND expires_at > now RETURNING …).
- Do not log the raw code outside of the create/consume audit lines.
- Code TTL: 10 minutes.

OUTPUT
- The new routes + the regex branch in channel-router.
```

### 🧪 Testing Instructions
1. Login → POST `/team/identities/claim {"channel":"telegram"}` → returns `{ code: 'OC-XXXXXX', expiresAt: ... }`.
2. Send `claim OC-XXXXXX` from Telegram → reply "Linked!"; subsequent `findChannelIdentity('telegram', chatId)` returns the row.
3. Try to claim same code twice → second attempt → "Invalid or expired".
4. Wait 11 minutes → claim → "Invalid or expired".
5. Use claim code on wrong channel → "Invalid or expired".

### ✅ Acceptance Criteria
- [ ] Codes are 6 chars from a confusion-free alphabet.
- [ ] Atomic single-use.
- [ ] TTL enforced.
- [ ] Already-linked sender gets a clear message.

---

## STORY 4.6 — Mode C: Auto-Create Guest User from Sender

### 🎯 Description
For workspaces with `auto_create_guest_users=true`: when an unknown sender messages, create a `users` row (`is_admin=0, status='active', email='<channel>:<id>@guest.local'`), link the `channel_identity`, and dispatch as that guest user.

Source: `05-channel-routing/routing.md` "Mode C".

### ⚙️ Implementation Details

**Storage**: workspace settings live in `~/.openclaw/team/workspaces/<wsId>.json` or in a small `workspaces` table column. Pick one and stick to it.

**Logic**:
```
if not findChannelIdentity AND workspaceConfig.auto_create_guest_users:
  email = `${channel}:${externalId}@guest.local`
  user = createUser({ email, passwordHash: '!disabled!', isAdmin: false }) // password hash sentinel — login disabled
  createChannelIdentity({ user_id: user.id, channel, external_id, display_name, workspace_id })
  dispatch(...)
```

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Implement Mode-C auto-create-guest in src/team/channel-router.ts.

REQUIREMENTS
1. Add a workspace-config loader: getWorkspaceConfig(wsId): { auto_create_guest_users: boolean, ... }.
2. After identity miss + claim-flow miss, check the workspace config.
3. If auto_create_guest_users:
   - Per-IP rate limit: max 10 new guests/min (in-memory LRU). Exceeded → drop, do not auto-create.
   - email = `${channel}:${externalId}@guest.local`.
   - createUser({ email, passwordHash: '!disabled!', name: displayName ?? null, isAdmin: false, status: 'active' }).
   - createChannelIdentity(...).
   - dispatch(userId, ws, channel, threadId, text, attachments).
4. The hashed password sentinel '!disabled!' must NEVER pass argon2.verify; the guest cannot log in.
5. Log a single line `[team] guest user created: ${userId} ${channel}:${externalId}` per creation.

CONSTRAINTS
- No upper bound on total guests (operator's responsibility), only per-IP burst limit.
- The guest's email is non-routable. Don't send any email.

OUTPUT
- The Mode-C branch + getWorkspaceConfig helper.
```

### 🧪 Testing Instructions
1. Set workspace `auto_create_guest_users=true` → unknown sender messages → guest user appears in `users` with email `telegram:<id>@guest.local`.
2. Same sender messages again → no new user; existing identity resolves.
3. Set to false → unknown sender drops without creating anything.
4. 11 unknown senders in 1 minute (Mode C on) → 10 created, 11th dropped.
5. Try to login with the guest's email + any password → 401.

### ✅ Acceptance Criteria
- [ ] Guest user created on first inbound from unknown sender (when enabled).
- [ ] Cannot log in.
- [ ] Per-IP rate limit honored.
- [ ] Existing senders resolved without re-creation.

---

## STORY 4.7 — File Streaming for Inbound Documents/Images

### 🎯 Description
When a Telegram document/photo or WhatsApp media message arrives, download the media bytes and `secureWrite` them under the user's `uploadsDir`, then attach `{ path, mimeType }` to the runtime call.

Source: `05-channel-routing/routing.md` "File Attachments Are Streamed Into the User's `uploadsDir`".

### ⚙️ Implementation Details

**Files**: `src/team/channel-router.ts`, `src/team/wa-meta-client.ts` (Story 4.2).

```ts
const filename = `${Date.now()}_${message.document.file_id}.pdf`;
const destPath = path.join(team.files.uploadsDir, filename);
await secureWrite(team.userId, destPath, '');   // creates + validates path
await streamTelegramFile(botToken, message.document.file_id, destPath);
message.attachments = [{ path: destPath, mimeType: 'application/pdf' }];
```

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Implement inbound file streaming for both channels.

REQUIREMENTS
1. Telegram:
   - Telegram media is referenced by file_id. Resolve via:
       GET https://api.telegram.org/bot<TOKEN>/getFile?file_id=<id> → { result: { file_path } }
       GET https://api.telegram.org/file/bot<TOKEN>/<file_path> → bytes
   - Stream into <uploadsDir>/<timestamp>_<file_id>.<ext>.
2. WhatsApp Meta:
   - Resolve media-id: GET https://graph.facebook.com/v17.0/<media-id> → { url, mime_type }.
   - GET that URL with Authorization: Bearer <access_token> → bytes.
   - Stream into <uploadsDir>/<timestamp>_<media-id>.<ext>.
3. Always:
   - Compute destPath BEFORE creating the file.
   - secureWrite(userId, destPath, '') first to validate path; throws on traversal.
   - Stream bytes into destPath via fs.createWriteStream + pipeline().
   - On stream error: fs.rm the partial file; rethrow.
4. Cap per-file size: env OPENCLAW_TEAM_MAX_UPLOAD_BYTES default 25 MB; over-cap → reject + drop.
5. Allowed mimeTypes: image/*, application/pdf. Others → log + drop.

CONSTRAINTS
- secureWrite must fire BEFORE the network request to verify path.
- Stream — never load whole file in memory.
- Filenames are server-constructed (timestamp + file_id) — no user input.

OUTPUT
- streamTelegramFile and streamMetaMedia helpers.
- The integration into the webhook handlers.
```

### 🧪 Testing Instructions
1. Send a 1 MB PDF via Telegram → file lands at `users/user_<id>/uploads/<ts>_<fileId>.pdf`.
2. attachments[0].path equals that absolute path; mimeType is `application/pdf`.
3. Send a 30 MB PDF (over cap) → drop, log a "rejected: over size cap".
4. Send a `.exe` (mime application/x-msdownload) → drop, log "unsupported mime".
5. Tampered file_id with `..` sequences → secureWrite throws SecureFsViolationError; nothing written.

### ✅ Acceptance Criteria
- [ ] Files always land under per-user `uploadsDir`.
- [ ] Size cap enforced.
- [ ] Mime allowlist enforced.
- [ ] Path validated before any bytes streamed.
- [ ] No shared media folder write.
