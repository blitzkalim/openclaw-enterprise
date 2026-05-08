# Flow A: Tenant Onboarding

## Scenario
A real estate agency owner discovers OpenClaw TeamOS and wants to set up their team.

## Flow Steps

### 1. Discovery
```
User lands on website (openclaw-teamos.com)
  -> Sees value prop: "AI-powered lead management for real estate"
  -> Clicks "Start Free Trial"
```

### 2. Account Creation
```
Email + Password form
  -> Validate email uniqueness
  -> Create user record (platform users table)
  -> Send verification email
  -> Auto-verify if using Google OAuth
```

### 3. Tenant Setup
```
User enters:
  - Agency name: "Bandra Elite Properties"
  - Slug (auto-generated): bandra-elite
  - Country: India
  - Timezone: Asia/Kolkata
  - Team size: 3-5 agents

Platform:
  -> Creates tenant record
  -> Sets plan: "Pro Trial" (14 days)
  -> Creates default workspace: "Main Office"
  -> Sets owner role for user
```

### 4. Welcome Wizard (3 steps)

**Step 1: Connect WhatsApp**
```
"Your customers message you on WhatsApp. Let's connect your business number."

Options:
  a) "I have a WhatsApp Business API provider (Gupshup, Twilio)"
     -> Paste API credentials
     -> Validate and connect

  b) "I don't have one yet"
     -> Show setup guide for Gupshup (India)
     -> Link to Gupshup signup
     -> "Come back and paste your API key"

  c) "Skip for now"
     -> Can connect later in Settings
```

**Step 2: Configure AI Agent**
```
"Set up your AI assistant"

Fields:
  - Bot name: "Priya" (default)
  - Welcome message: "Hi! I'm Priya from Bandra Elite. Looking for a property?"
  - Office hours: Mon-Sat 9am-8pm (default)
  - Handoff to human: "type 'talk to human' or 'manager'"
  - Property types: 1BHK, 2BHK, 3BHK, Villa (checkboxes)
  - Areas served: Bandra, Khar, Santacruz (text input)
  - Budget range hint: "Typically 1Cr - 15Cr" (optional)

AI generates system prompt automatically.
User can preview: "Test with sample messages"
```

**Step 3: Invite Team**
```
"Add your team members"

Email invites:
  - Agent: amit@bandraelite.com
  - Agent: priya@bandraelite.com
  - Manager: rajesh@bandraelite.com

Roles selected from dropdown.
Invitation emails sent with join link.
```

### 5. Dashboard First View
```
Shows:
  - "Welcome to your command center"
  - Quick actions: Connect WhatsApp, Invite more team, View demo
  - Sample data toggle: "See how leads look" (creates 3 fake leads)
  - Getting started checklist:
    [x] Create account
    [x] Set up AI agent
    [ ] Connect WhatsApp
    [ ] Invite team
    [ ] Upload property inventory
    [ ] Test with a friend
```

### 6. First Lead (Simulated)
```
System sends test WhatsApp to owner's number:
  "[TEST] Hi! I saw your listing for a 2BHK in Bandra. Is it still available?"

Owner sees:
  - Lead appears in dashboard
  - AI auto-responded with welcome message
  - Shows: "This is a simulation. Real leads will appear here when WhatsApp is connected."
```

## Time to First Value

| Step | Time |
|------|------|
| Signup to account | 1 minute |
| Tenant setup | 2 minutes |
| Wizard completion | 5 minutes |
| First simulated lead | 1 minute |
| **Total** | **~10 minutes** |

## Friction Points & Mitigations

| Friction | Mitigation |
|----------|------------|
| No WhatsApp Business account | Provide Gupshup signup guide, allow skip |
| Don't know what AI should say | Pre-filled defaults + preview + examples |
| Team not ready to invite | One-click "Invite later" with reminder email in 2 days |
| Confusing dashboard | Sample data + guided tour (intercom-style) |

## Error Handling

```
WhatsApp connection fails
  -> Show specific error: "Invalid API key" or "Webhook URL rejected"
  -> Link to troubleshooting doc
  -> Offer live chat support (for trial users)

Email verification fails
  -> "Resend email" button
  -> "Use Google sign-in instead" option

Slug taken
  -> Suggest alternatives: bandra-elite-2, bandraelite, bandraeliteprop
```

## Post-Onboarding Sequence

| Time | Action |
|------|--------|
| +1 hour | Email: "Your AI is ready. Here's how to test it." |
| +1 day | Email: "3 tips to get your first lead" |
| +3 days | In-app: "Connect your WhatsApp to go live" (if not done) |
| +7 days | Email: "Your trial ends in 7 days. Upgrade to keep your leads." |
| +12 days | Email: "Last chance — 20% off first year" |
| +14 days | Auto-downgrade to Community if not converted |
