# Flow E: Billing & Subscription Management

## Scenario
Tenant admin Rajesh manages billing for Bandra Elite Properties.

## Flow Steps

### 1. Plan Selection
```
Settings -> Billing

Current Plan: Pro Trial (12 days remaining)

Available Plans:
  [Community]     Free
    - Single user
    - File-based storage
    - Telegram only
    - No AI agents
    - Community support

  [Pro]          $49/month  [Currently selected]
    - Up to 5 users
    - WhatsApp + Telegram + Email
    - AI lead intake + inventory search
    - 500 WhatsApp conversations
    - 10GB storage
    - Zoho/HubSpot CRM sync
    - Email support

  [Pro Plus]     $99/month
    - Up to 15 users
    - All channels
    - All 6 starter agents
    - 2,000 WhatsApp conversations
    - 50GB storage
    - Salesforce + custom webhooks
    - Priority support

  [Enterprise]   Custom pricing
    - Unlimited users
    - All features + custom agents
    - Dedicated infrastructure option
    - SLA + phone support
    - Onboarding + training

Plan selector: [Monthly] [Yearly - save 20%]
```

### 2. Add Payment Method
```
For India (UPI + Cards):
  - UPI ID: rajesh@okaxis
  - Credit/Debit Card: [Secure form via Stripe/Razorpay]
  - Net Banking: [Bank list]
  - Auto-pay toggle: [On/Off]

First charge: Trial converts to paid after 14 days.
```

### 3. Invoice History
```
Invoice #001 | Mar 2024 | Pro $49 | [Download PDF]
Invoice #002 | Apr 2024 | Pro $49 | [Download PDF]
Invoice #003 | May 2024 | Pro Plus $99 | [Download PDF]

Each invoice shows:
  - Plan fee
  - WhatsApp overage (if any)
  - LLM usage (estimated)
  - GST 18% (India)
  - Total
```

### 4. Usage Dashboard
```
Current Period (June 2024)

WhatsApp Conversations:
  [||||||||    ] 340 / 500 included (68%)
  Projected: 520 (20 overage @ $0.01 = $0.20)

AI Messages:
  [|||||||     ] 2,100 / 5,000 included (42%)

Storage:
  [||          ] 4.2GB / 10GB included (42%)

Team Members:
  [|||||       ] 4 / 5 included (80%)

CRM Sync:
  [||          ] 120 leads synced this month
```

### 5. Overage Handling
```
When approaching limit:
  Day -3: Email "You're at 90% of WhatsApp conversations"
  Day -1: Dashboard banner + email "Upgrade to avoid interruptions"

At limit:
  - New inbound WhatsApp: AI replies once with:
    "Thanks for your message. Our team will get back to you shortly."
  - No new AI qualification
  - Human agents can still reply
  - Dashboard shows: "Upgrade plan to restore AI lead capture"
```

### 6. Plan Upgrade
```
Rajesh clicks "Upgrade to Pro Plus"
  -> Prorated calculation shown:
     "You have 10 days left in current billing period.
      Pay $33 today for Pro Plus, then $99/month starting July 1."
  -> Confirm
  -> Charge prorated amount
  -> Immediate access to Pro Plus features
  -> WhatsApp limit increases to 2,000
```

### 7. Plan Downgrade
```
Rajesh clicks "Downgrade to Pro"
  -> Warning: "Downgrade effective next billing cycle (July 1)
               Current team: 7 users -> 5 user limit. 
               Please remove 2 team members before downgrade."
  -> If team <= 5: Proceed
  -> If team > 5: Must remove members first
  -> At billing cycle: downgrade effective
```

### 8. Cancellation
```
Rajesh clicks "Cancel Subscription"
  -> "We're sorry to see you go!"
  -> Reason survey (optional):
     [ ] Too expensive
     [ ] Not enough features
     [ ] Switching to competitor
     [ ] Not using it enough
     [ ] Technical issues
     [ ] Other
  -> "Your data will be available for 30 days. Export now?"
  -> [Export All Data] [Just Cancel]
  -> Subscription ends at current period end
  -> Tenant downgraded to Community (1 user, read-only)
  -> After 30 days: data purged (except audit logs 7 years)
```

### 9. Data Export
```
Before cancellation or anytime:
  Settings -> Data -> Export
  -> Select: Leads, Conversations, Documents, Reports, Agent Configs
  -> Format: CSV, JSON, or full SQL dump
  -> Delivery: Download link (valid 7 days) or email
  -> Processing time: ~10 minutes for < 10K leads
```

### 10. Refund Policy
```
Refund rules:
  - First 7 days: Full refund, no questions
  - 8-14 days: Prorated refund (minus processing)
  - After 14 days: No refund, cancel at period end
  - Overage charges: Non-refundable
  - Annual plans: Prorated refund within 30 days
```

## Billing Architecture

```
Stripe / Razorpay
  -> Webhook: payment succeeded / failed
    -> Update tenant subscription status
      -> If failed: grace period 3 days
        -> If still failed: suspend AI features
          -> After 7 days: downgrade to Community
            -> After 30 days: initiate data purge
```

## Self-Hosted Billing (Enterprise)

```
Enterprise tenants can:
  - Purchase annual license key
  - Self-host on their infrastructure
  - No per-seat billing
  - Support contract sold separately

License key validation:
  - Daily check to license server
  - Grace period: 7 days offline
  - No data lockout (open source)
```
