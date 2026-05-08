# 05 — Channel Routing (WhatsApp + Telegram)

## The One Sentence

A webhook arrives, we look up which **system user** owns the sender's phone or telegram_id, we call OpenClaw's existing agent runtime with that user's context, and we send the reply back through the existing channel client.

We do not build a new agent runtime. We do not rewrite OpenClaw's channel layer. We add **two small webhook handlers** and **one mapping table**.

## The Mapping Table: `channel_identities`

| Field | Type | Notes |
|---|---|---|
| `id` | TEXT (uuid) | |
| `user_id` | TEXT FK → users.id | Which system user this external identity belongs to |
| `workspace_id` | TEXT NULL | Mirrors the user's workspace at mapping creation time |
| `channel` | TEXT | `whatsapp` \| `telegram` |
| `external_id` | TEXT | Phone in E.164 (`+919876543210`) for WhatsApp, numeric chat id for Telegram |
| `display_name` | TEXT NULL | Last seen "first_name last_name" or contact name |
| `created_at` | TEXT (ISO) | |

UNIQUE on (`channel`, `external_id`). The same external phone can only ever be claimed by one system user — first claim wins, second attempt is rejected with a clear message.

## The Two Webhook Endpoints

Both register only when `OPENCLAW_TEAM_MODE=1` is set. They live in `src/team/channel-router.ts`.

### Telegram

```
POST /webhooks/telegram/:workspaceId
Header: X-Telegram-Bot-Api-Secret-Token: <per-workspace secret>

Body (Grammy / Telegram update):
{
  "message": {
    "chat": { "id": 8675309, "type": "private", "first_name": "Rahul" },
    "from": { "id": 8675309, "first_name": "Rahul" },
    "text": "Add lead Rahul wants 2BHK"
  }
}
```

Flow:

1. Verify `X-Telegram-Bot-Api-Secret-Token` matches the secret stored on the workspace's Telegram bot config (looked up in OpenClaw's existing telegram extension state, or in our `workspaces` row).
2. `external_id = String(message.chat.id)`.
3. `channel_identities` lookup (`channel='telegram', external_id=…, workspace_id=:workspaceId`).
4. **Found** → carry on with `userId`. **Not found** → fall through to **claim flow** (below).
5. Build session key: `u:<userId>:tg:<chatId>`.
6. Hand off to OpenClaw's agent runtime via the same internal entry point `extensions/telegram/` already uses, except we pass our `team` context.
7. The agent's outbound text is sent via the existing telegram extension's send path — we do **not** re-implement it.

### WhatsApp (Meta Cloud API only — see §02 simplification)

```
POST /webhooks/whatsapp/:workspaceId
Header: X-Hub-Signature-256: sha256=<hex of HMAC(payload, app_secret)>

Body (Meta Cloud API):
{
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "919876543210",
          "type": "text",
          "text": { "body": "Hi, I need a 2BHK in Bandra" }
        }],
        "contacts": [{ "profile": { "name": "Rahul" }, "wa_id": "919876543210" }]
      }
    }]
  }]
}
```

Flow is the same as Telegram with two differences:

- Signature verification is HMAC-SHA256 over the raw body using the channel's app secret.
- `external_id` is the E.164 phone (`+` + `wa_id`).

### Why Meta Cloud API only?

The full plan (`/kalim/enterprise-plan/07-whatsapp-strategy/`) recommends Gupshup for India, then Meta Cloud at scale, then a hybrid. For the simple plan we **pick one** to keep complexity flat. Meta Cloud API:

- Free webhook signatures, free template messaging on free tier.
- Same vendor as WhatsApp, no middleman.
- Supported by OpenClaw's existing extension architecture (we don't use Baileys here — Baileys is QR-paired and inherently single-device, fine for a solo user but not for a team).

If a team prefers Gupshup, they swap the verifier and the outbound client. The router code is unchanged.

We **do not** use the existing Baileys-based `extensions/whatsapp/` plugin for team mode — Baileys pairs to one device and that's the wrong abstraction for a multi-user webhook. The Baileys plugin keeps working for solo users when team mode is off.

## Mapping a Sender to a User: Three Options

When `external_id` is unknown to `channel_identities`, the router has to decide whose user it is. We support **three** modes, picked per workspace:

### Mode A — Pre-claimed (default)

A user, while logged into `/team`, clicks **"Add my Telegram"** or **"Add my WhatsApp"**. The page shows a one-time **claim code** like `OC-7K2X9Q`.

The user messages the workspace's bot/number from their phone with `claim OC-7K2X9Q`. The router sees the message:

1. Look up the claim code in `channel_claims` (a transient table; we'll fold it into `user_sessions` style — 6 lines of code).
2. If valid and unused, INSERT into `channel_identities`, mark code consumed, reply: "Linked. You can now message me normally."
3. Future messages from that `external_id` resolve cleanly.

This is the **simplest, safest, most explicit** flow. No phone-number-to-user heuristics, no admin assignment.

### Mode B — Admin-assigns

Admin types in the user's phone in `/team` ("Rahul → +919876543210") and the row is created up-front. First inbound message immediately resolves.

Useful when the team is small and the admin already knows who's who.

### Mode C — Auto-create user from sender (off by default)

For workspaces that want a public-facing bot (e.g. a real-estate agency where every WhatsApp sender is a *prospect*, not a teammate): unknown sender → create a "guest user" row with `is_admin=false, status='active', email='wa:+919…@guest.local'`, link `channel_identity` to it, hand off to a designated "intake" agent.

This is the lead-capture model from the big plan's flow B. We support it as a workspace setting (`auto_create_guest_users = true`) with one sane default agent (`agent = 'intake'`).

## The Forwarding Path Into Existing OpenClaw

Once the router has `{ userId, workspaceId, sessionKey, text, attachments[] }`, it calls OpenClaw's existing chat / agent entry point. That entry point already exists — every channel extension uses it. We pass `team` (including resolved file paths) on the runtime request.

```ts
async function dispatch(team, channel, threadId, message) {
  const sessionKey = `u:${team.userId}:${channel}:${threadId}`;

  // team.files already resolved by auth middleware — no second call needed:
  // { soulPath, agentsPath, memoryPath, uploadsDir }

  await openclawRuntime.handleInbound({
    sessionKey,
    channel,
    text:        message.text,
    attachments: message.attachments,
    team: {
      ...team,
      files: team.files,   // ← resolved per-user file paths, read by agent runtime
    },
  });
  // Agent runtime emits outbound events; existing channel sender picks them up.
}
```

### File Attachments Are Streamed Into the User's `uploadsDir`

For messages that carry a document/image (e.g. a Telegram PDF or a WhatsApp media message), the channel router downloads and stores the file **before** calling `dispatch`:

```ts
// Telegram document handler — inside channel-router.ts
import { secureWrite } from '../team/secure-fs.js';

if (message.document && team?.files) {
  const filename = `${Date.now()}_${message.document.file_id}.pdf`;
  const destPath = path.join(team.files.uploadsDir, filename);

  // Validate path boundary BEFORE streaming any bytes
  await secureWrite(team.userId, destPath, '');   // zero-byte write to validate + create file
  await streamTelegramFile(botToken, message.document.file_id, destPath);
  message.attachments = [{ path: destPath, mimeType: 'application/pdf' }];
}
```

This ensures:
- Each user's uploads land in their own isolated directory (`uploadsDir = workspace/users/user_<id>/uploads/`).
- Two users uploading the same filename never collide — timestamp prefix guarantees uniqueness.
- The agent runtime receives an **absolute local path** in `attachments[].path` — no URL, no shared media folder access.
- `secureWrite` validates the destination path against the user boundary **before** any bytes are streamed, so a tampered `file_id` containing path traversal sequences is caught early.

**Why we bypass `src/media/store.ts` here:** The existing media store writes to the
shared `~/.openclaw/media/` directory (verified from `src/media/store.ts` line 15:
`const resolveMediaDir = () => path.join(resolveConfigDir(), 'media')`). In team mode
we route around it to keep each user's files isolated. The shared media store continues
to work for non-team requests unchanged.

Because we reuse OpenClaw's runtime and its existing channel-extension send path, we get **for free**:

- Multi-turn conversation handling
- Tool / skill invocation
- Streaming token output
- Vector memory lookups (now keyed by user, see §06)
- Cron-driven follow-ups

## Outbound (Agent → User)

Agent generates a reply. The existing channel extension's send path is called with the original `threadId`. The reply lands in the user's WhatsApp/Telegram. We add nothing here.

If multiple users share the same WhatsApp number (e.g. one shared workspace number), outbound goes to whichever phone the inbound message came from. This is identity-by-`external_id` and is automatic.

## Failure Modes

| Failure | Behavior |
|---|---|
| Signature mismatch | 401, log to OpenClaw's existing logger, drop |
| Unknown `external_id` and Mode A | Reply with claim instructions if message is `claim …`; else ignore (don't reply to strangers) |
| Unknown `external_id` and Mode B | Log + drop (admin will see it in `/team` activity panel) |
| Unknown `external_id` and Mode C | Auto-create guest user; if rate-limit per IP exceeded, drop |
| User disabled (`status='disabled'`) | 200 OK to provider (don't retry), drop message internally |
| Workspace bot misconfigured | 503 to provider so it retries |

## Cost / Complexity Footprint

| Item | Lines of code |
|---|---|
| `src/team/channel-router.ts` (both webhooks, both modes) | ~150 |
| `src/team/channel-claim.ts` (claim-code generator + verifier) | ~60 |
| WhatsApp signature verifier | ~20 |
| Telegram secret-token check | ~10 |
| **Total** | **~240** |

No new infrastructure (no Redis, no queue), no new languages, no new build step.
