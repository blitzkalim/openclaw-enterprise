# WhatsApp Onboarding Flow

## Scenario

Real estate agency "Bandra Brokers" wants to connect their WhatsApp Business number to OpenClaw TeamOS.

## Flow (Using Gupshup / Interakt Provider)

### Step 1: Tenant Chooses WhatsApp

```
Tenant Admin opens Settings -> Channels -> WhatsApp
  -> sees "Connect WhatsApp Business"
    -> selects provider: Gupshup / Interakt / Twilio / Meta
      -> sees pricing estimate for selected provider
```

### Step 2: Provider-Specific Setup

**For Gupshup:**
```
Tenant Admin clicks "Connect via Gupshup"
  -> redirected to Gupshup OAuth
    -> authorizes app
      -> Gupshup redirects back with app_id and api_key
        -> platform stores credentials (encrypted)
          -> auto-configures webhook URL
            -> shows "Connected" status
```

**For Meta Cloud API:**
```
Tenant Admin clicks "Connect via Meta"
  -> sees instructions:
     1. Create Meta Business Account
     2. Add phone number
     3. Verify phone via SMS
     4. Generate permanent token
  -> tenant pastes access_token and phone_number_id
    -> platform validates token
      -> configures webhook
        -> shows "Connected" status
```

### Step 3: Webhook Configuration

```
Provider sends test webhook to:
  POST https://platform.example.com/webhooks/whatsapp/{tenantId}
    -> verify signature
      -> store provider message_id mapping
        -> reply with HTTP 200
          -> show "Webhook verified" in UI
```

### Step 4: Test Message

```
Tenant Admin clicks "Send Test Message"
  -> platform sends template message to tenant's own number
    -> "Welcome to OpenClaw! Your WhatsApp is connected."
      -> shows delivery status
        -> green checkmark = working
```

### Step 5: Bot Personality Setup

```
Tenant Admin configures:
  - Bot name: "Priya" (display name on WhatsApp)
  - Welcome message: "Hi! I'm Priya from Bandra Brokers. How can I help you today?"
  - Office hours: Mon-Sat 9am-8pm
  - Handoff keywords: "talk to human", "manager", "complaint"
  - Auto-reply outside hours: "Thanks for reaching out! We're currently offline. We'll get back to you tomorrow at 9am."
```

### Step 6: Go Live

```
Tenant Admin toggles "Active"
  -> platform starts receiving webhooks
    -> AI processes incoming messages
      -> replies via provider API
        -> conversations logged in dashboard
```

## Per-Tenant Webhook URL Design

```
POST /webhooks/whatsapp/{tenantId}

Headers:
  X-Provider: gupshup | twilio | meta | interakt
  X-Signature: <hmac-sha256 of payload>

Body (normalized from provider format):
  {
    "provider_message_id": "msg_123",
    "from": "919876543210",
    "timestamp": 1715000000,
    "type": "text",
    "text": "I want 2BHK in Bandra",
    "profile": {
      "name": "Rahul Sharma"
    }
  }
```

## Credential Storage

```typescript
// src/enterprise/channel-credentials.ts
import { encrypt, decrypt } from './crypto';

async function storeChannelCredentials(
  tenantId: string,
  provider: string,
  credentials: Record<string, string>
): Promise<void> {
  const encrypted = encrypt(JSON.stringify(credentials), process.env.MASTER_KEY);

  await db('channel_connections').insert({
    tenant_id: tenantId,
    channel_type: 'whatsapp',
    provider,
    credentials: encrypted,
    webhook_secret: generateWebhookSecret(),
  });
}

async function getChannelCredentials(tenantId: string, provider: string) {
  const row = await db('channel_connections')
    .where({ tenant_id: tenantId, channel_type: 'whatsapp', provider })
    .first();

  if (!row) return null;

  return JSON.parse(decrypt(row.credentials, process.env.MASTER_KEY));
}
```

## Template Registration (Meta Cloud API)

```
Tenant Admin creates templates in Meta Business Manager
  -> platform polls template status
    -> approved templates available for outbound
      -> stored in templates table per tenant

Table: whatsapp_templates
  tenant_id, template_name, language, status, category, components, approved_at
```

## Fallback When WhatsApp Fails

```
WhatsApp message delivery fails
  -> retry 3 times with exponential backoff
    -> still fails after 24 hours
      -> mark conversation as "needs attention"
        -> notify tenant admin via email
          -> suggest: check phone number, check provider balance
```
