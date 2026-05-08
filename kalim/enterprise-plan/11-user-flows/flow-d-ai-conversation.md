# Flow D: AI Conversation Lifecycle

## Scenario
Multiple interactions between customer, AI, and human agent over several days.

## Day 1: Initial Contact

```
Customer: "Looking for 2BHK Bandra, 3Cr budget"

AI: "Hi! I'm Priya from Bandra Elite... [qualifying questions]"

Customer: "Self-use, 3 months, need parking"

AI: "Great! I found 2 matches... [properties listed]"

Customer: "Sea View looks good. Weekend visit?"

AI: "Sure! Saturday or Sunday?"

Customer: "Sunday morning with family"

AI: "Booked Sunday 10am. Amit will meet you. Brochure?"

Customer: "Yes please"

AI: Sends PDF brochure
  -> Creates lead (Rahul, qualified)
  -> Schedules site visit
  -> Assigns to Amit
```

## Day 2: Customer Follow-up

```
Customer: "Can we make it 11am instead?"

AI: "Let me check... Updated to 11am. Amit confirmed."
  -> Updates calendar event
  -> Notifies Amit of time change
```

## Day 3: Post-Visit

```
Customer: "We liked the property. What's the final price?"

AI: "Glad you liked it! The listed price is 2.85 Cr. 
     For negotiation, I'm connecting you with Amit who handles pricing."

-> AI triggers handoff:
   - Flags "negotiation_request"
   - Stops auto-reply
   - Amit gets priority notification
   - Lead status changes to "Negotiating"
```

Amit takes over:
```
Amit: "Hi Rahul, this is Amit from Bandra Elite. 
      Glad you liked Sea View. The owner is asking 2.85 but we can negotiate 
      based on payment terms. Are you looking at full cash or home loan?"

Customer: "Home loan. Can we get it for 2.75?"

Amit: "Let me speak to the owner and get back to you today evening."
```

Amit updates lead:
```
- Status: Negotiating
- Offer price: 2.75 Cr
- Payment: Home loan
- Note: "Customer liked property. Negotiating 2.75. Meeting owner today."
```

## Day 4: Counter Offer

```
Amit (via dashboard): "Rahul, owner is willing to go down to 2.80 
                       with 20% advance. Does that work?"

Customer (WhatsApp): "2.78 and we have a deal. 25% advance."

Amit: "Let me check... Owner agreed! 2.78, 25% advance. 
       I'll send the agreement draft. When can we meet to sign?"

Customer: "This Saturday"
```

Amit updates:
```
- Status: Closed
- Final price: 2.78 Cr
- Commission: 1% = 27.8L
- Closing date: Saturday
- Documents pending: Agreement draft
```

System:
```
-> Triggers CRM sync
-> Updates inventory (mark property sold)
-> Generates commission report
-> Sends celebration notification to team
-> Requests customer review
```

## Conversation States

| State | Description | AI Behavior | Human Can Intervene |
|-------|-------------|-------------|-------------------|
| `bot_active` | AI handling all replies | Full auto-reply | Anytime via "Take Over" |
| `bot_assisted` | AI suggests, human approves | Drafts replies, human edits | Always |
| `human_active` | Human took over | Paused, reads context | Human releases back |
| `handoff_pending` | AI triggered handoff | Paused | Agent must accept |
| `resolved` | Issue resolved | Paused, available if customer returns | N/A |
| `spam` | Detected spam | Auto-close, no reply | Admin can review |

## Context Window Management

```
Conversation grows beyond token limit:
  1. Summarize older messages (every 20 exchanges)
  2. Store summary in conversation summary field
  3. Include summary + last 10 messages in AI prompt
  4. Full history always in database (for human review)
```

## Multi-Channel Continuity

```
Customer messages on WhatsApp
  -> Next day messages on Telegram
  -> System recognizes: same phone number
  -> Merges into single conversation
  -> AI has full context across channels
  -> Agent sees unified timeline
```

## AI Personality Consistency

```
Across all messages:
  - Same bot name: "Priya"
  - Same tone: Professional but warm
  - Same knowledge: Property inventory, pricing, policies
  - Same handoff triggers: "human", "manager", "complaint"
  - Same office hours awareness

If customer asks "What did we discuss yesterday?"
  -> AI retrieves conversation summary
  -> Answers accurately
```

## Escalation Triggers

| Trigger | Action |
|---------|--------|
| Customer says "talk to human" | Immediate handoff, AI pauses |
| Customer asks price negotiation | Suggest human agent, create handoff |
| Customer is angry (sentiment < -0.5) | Alert manager + offer human |
| Same question asked 3 times | Alert assigned agent |
| Office hours + urgent request | Schedule callback + notify team |
| Property not in inventory | AI says "I'll check with team" + flag |
| Budget mismatch (>20% over ask) | Suggest alternatives + notify agent |
