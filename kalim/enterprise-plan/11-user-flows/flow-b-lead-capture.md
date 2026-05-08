# Flow B: Lead Capture & Qualification

## Scenario
A prospective buyer messages the agency's WhatsApp number.

## Flow Steps

### 1. Inbound Message
```
Customer sends WhatsApp to +91-98765-43210:
"Hi, I'm looking for a 2BHK in Bandra West. Budget around 3 crores."
```

### 2. Webhook Processing
```
WhatsApp provider -> POST /webhooks/whatsapp/{tenantId}
  -> Verify webhook secret
    -> Normalize message
      -> Store in messages table
        -> Check if existing conversation
          -> Yes: append to conversation
          -> No: create new conversation + initial lead record
```

### 3. AI Lead Intake Agent Activates
```
Agent "Priya" processes:
  1. Extracts intent: property search
  2. Extracts criteria: 2BHK, Bandra West, 3Cr budget
  3. Greeting + confirmation message

AI Response:
"Hi! I'm Priya from Bandra Elite Properties. I'd be happy to help you find a 2BHK in Bandra West within your budget of around 3 crores.

To suggest the best options, may I ask:
1. Is this for self-use or investment?
2. What's your timeline — are you looking to move in immediately or in the next few months?
3. Any specific amenities you're looking for (parking, gym, etc.)?"
```

### 4. Customer Replies
```
Customer:
"Self-use. Looking to move in within 3 months. Need parking for sure."
```

### 5. AI Updates Lead
```
Agent updates lead record:
  - purpose: self_use
  - timeline: 3_months
  - requirements: ["parking"]
  - status: qualified

Agent searches inventory:
  "Let me check what we have available..."
```

### 6. Inventory Search
```
AI queries property database (within tenant scope):
  - location: "Bandra West"
  - type: "2BHK"
  - budget <= 3Cr
  - parking: yes
  - possession <= 3 months

Results: 2 matches found
```

### 7. AI Presents Properties
```
AI Response:
"Great news! I found 2 properties that match your criteria:

1. **Sea View Residency, Bandra West**
   - 2BHK, 950 sq ft
   - Price: 2.85 Cr
   - Parking: 1 covered slot
   - Possession: Ready
   - Amenities: Gym, swimming pool
   [View Photos] [Schedule Visit]

2. **Sunflower Apartments, Bandra West**
   - 2BHK, 880 sq ft
   - Price: 2.6 Cr
   - Parking: Street + visitor
   - Possession: 2 months
   - Amenities: Garden, kids play area
   [View Photos] [Schedule Visit]

Would you like to schedule a site visit for either of these?"
```

### 8. Customer Chooses
```
Customer:
"I'd like to see Sea View Residency. This weekend possible?"
```

### 9. AI Schedules Site Visit
```
Agent:
"Sure! I can check availability for this weekend.

Which day works better for you?
- Saturday (10am - 6pm)
- Sunday (10am - 6pm)

Also, who should I expect?
- Just you
- With family"
```

### 10. Customer Confirms
```
Customer: "Sunday morning with family."
```

### 11. AI Creates Appointment
```
Agent:
"Perfect! I've tentatively booked:

**Site Visit: Sea View Residency**
- Date: Sunday, [date]
- Time: 10:00 AM
- Property: 2BHK, 950 sq ft, 2.85 Cr
- Address: [address]

One of our agents will meet you there. You'll receive a confirmation shortly.

Would you also like me to send you the brochure and floor plan via WhatsApp?"

Action: Creates calendar event, assigns to available agent, sends WhatsApp confirmation.
```

### 12. Dashboard Update
```
Agent dashboard shows:
  - New lead: "Rahul S." (qualified)
  - Source: WhatsApp
  - Budget: 3Cr
  - Timeline: 3 months
  - Property interest: Sea View Residency
  - Site visit: Scheduled
  - Assigned to: Amit (auto-assigned by round-robin)
  - AI conversation: Full transcript visible
```

### 13. Agent Notification
```
Amit (agent) receives:
  - WhatsApp: "New qualified lead: Rahul looking for 2BHK in Bandra. Site visit scheduled Sunday 10am at Sea View. Lead details: [link]"
  - Dashboard notification
  - Email (if not active in last 15 min)
```

## Edge Cases

### Duplicate Detection
```
Customer messages from same phone again
  -> Check leads table: phone + tenant_id
  -> If existing lead < 30 days old: append to existing
  -> If existing lead > 30 days old: create new lead, mark "returning"
```

### Outside Office Hours
```
Message arrives at 11pm
  -> AI replies: "Thanks for reaching out! Our office hours are 9am-8pm. We've received your message and our team will get back to you first thing tomorrow."
  -> Lead created, flagged "after-hours"
  -> Auto-assigned for 9am follow-up
```

### Handoff to Human
```
Customer: "I want to speak to a human"
  -> AI: "Of course! I'm connecting you to Amit from our team. He'll be with you shortly."
  -> Flag conversation: "human_requested"
  -> Notify assigned agent (priority)
  -> AI stops auto-replying
  -> Agent can take over via dashboard chat interface
```

### Language Switch
```
Customer: "Hindi mein baat karo" (Speak in Hindi)
  -> AI detects language change
  -> Switches to Hindi (if configured)
  -> Stores language_preference: 'hi' on lead
  -> All future AI responses in Hindi
  -> Human agent notified: "Lead prefers Hindi"
```

## Data Captured

| Field | Source | Example |
|-------|--------|---------|
| first_name | AI extraction | "Rahul" |
| phone | WhatsApp | +91-98765-43210 |
| source | Channel | "whatsapp" |
| property_type | Customer message | "2BHK" |
| location_preference | Customer message | "Bandra West" |
| budget_max | Customer message | 30000000 (3Cr) |
| purpose | AI follow-up | "self_use" |
| timeline | AI follow-up | "3_months" |
| status | AI logic | "qualified" |
| assigned_to | Round-robin | "Amit" |
| conversation_id | System | uuid |
| tags | AI logic | ["hot", "ready_to_visit"] |
