# Flow C: Agent Dashboard & Lead Management

## Scenario
Agent Amit logs in to manage his assigned leads.

## Flow Steps

### 1. Login
```
Amit opens dashboard.openclaw-teamos.com
  -> Enters email + password
  -> 2FA (if enabled)
  -> Sees his personalized dashboard
```

### 2. Dashboard Overview
```
Header: "Good morning, Amit! You have 5 leads today."

Cards:
  - New leads today: 2
  - Follow-ups pending: 3
  - Site visits scheduled: 1 (Sunday 10am)
  - Hot leads: 1 (Rahul - 2BHK Bandra)
  - Conversion this month: 2 deals

Quick Actions:
  [+ Add Lead] [Send Broadcast] [View Calendar] [My Performance]
```

### 3. Lead List View
```
Filter: "My leads" (default) | "All leads" (if manager) | "Unassigned"
Sort: Newest | Priority | Budget (high-low) | Follow-up due

Columns:
  - Name | Phone | Source | Property | Budget | Status | Last Contact | Actions

Example row:
  "Rahul S." | +91-98765... | WhatsApp | 2BHK Bandra | 3Cr | Qualified | 2 min ago | [View]
```

### 4. Lead Detail View (Click "View")
```
Lead Profile:
  - Name: Rahul Sharma
  - Phone: +91-98765-43210
  - Email: (not yet captured)
  - Source: WhatsApp
  - Budget: Up to 3 Crore
  - Timeline: 3 months
  - Status: Qualified
  - Assigned: Amit
  - Tags: Hot, Site Visit Scheduled
  - Created: Today, 9:15 AM

Conversation History:
  [Full AI transcript with timestamps]
  [Click "Take Over" to chat directly]
  [Click "Call" to initiate phone call]

Actions:
  [Update Status] -> New / Contacted / Qualified / Viewing / Negotiating / Closed / Lost
  [Add Note] -> Free text
  [Schedule Follow-up] -> Date + time picker
  [Reassign] -> (Manager only) Pick another agent
  [Add to CRM] -> Push to Zoho/HubSpot
  [Send Document] -> Upload brochure/agreement

Property Interest:
  - Sea View Residency (2BHK, 2.85Cr)
    [View Photos] [View Floor Plan] [Schedule Visit] [Mark Sold]
```

### 5. Update Lead Status
```
Amit clicks "Update Status" -> "Viewing"
  -> Prompt: "Did the customer confirm a site visit?"
  -> Amit: Yes, Sunday 10am
  -> System: Updates status, logs activity, notifies manager if configured
```

### 6. Add Manual Note
```
Amit adds note:
"Called Rahul. Confirmed Sunday visit. Wife is also coming.
Mentioned he wants to see parking space specifically.
Suggested comparing with Sunflower Apartments as backup."

Note is timestamped, attributed to Amit, visible in lead history.
```

### 7. View Conversation & Take Over
```
Amit clicks "View Conversation"
  -> Sees full AI chat transcript
  -> [Take Over] button
  -> When clicked:
     - AI pauses for this conversation
     - Amit can type replies directly
     - Customer sees: "Amit from Bandra Elite is now chatting with you"
     - Typing indicator shows when Amit is typing
     - AI resumes if Amit clicks [Release to AI]
```

### 8. Schedule Follow-up
```
Amit clicks "Schedule Follow-up"
  -> Calendar picker (week view)
  -> Select: Tomorrow, 11am
  -> Method: WhatsApp / Call / Email
  -> Note: "Check if he liked Sea View. Suggest Sunflower as alternative."
  -> Save

System:
  - Creates calendar event
  - Sets reminder: 10:55am tomorrow
  - Adds to Amit's follow-up list
  - If missed: Escalate to manager after 2 hours
```

### 9. Manager View (Rajesh)
```
Rajesh sees:
  - Team pipeline: 12 new | 8 qualified | 5 viewing | 2 negotiating | 1 closed
  - Agent performance:
    - Amit: 5 leads, 2 visits scheduled, 0 overdue
    - Priya: 3 leads, 1 visit, 1 overdue follow-up
  - [Reassign Lead] button
  - [Team Broadcast] button
  - [Export Leads] button (CSV)
```

### 10. Reassign Lead
```
Rajesh clicks [Reassign] on Priya's overdue lead
  -> Dropdown: Amit, Priya, Rahul, Unassigned
  -> Selects: Amit
  -> Optional message: "Amit, can you follow up on this today?"
  -> Confirm

Amit receives notification:
  - Dashboard: "Lead reassigned to you: Priya Sharma (2BHK Andheri)"
  - WhatsApp: "New lead assigned: Priya S. (details in dashboard)"
```

## Dashboard Features

### Search & Filter
```
Search: "Bandra" -> Shows leads with location preference = Bandra
Filter: Status = "Hot" + Source = "WhatsApp" + Budget > 2Cr
Save filter: "High-value WhatsApp leads"
```

### Bulk Actions (Manager)
```
Select multiple leads -> [Assign to Amit] [Change Status] [Add Tag] [Export] [Delete]
```

### Performance Metrics (Agent)
```
- Leads this month: 12
- Response time (avg): 8 minutes
- Conversion rate: 17% (2/12)
- Revenue generated: 5.7 Cr
- Top locations: Bandra (5), Andheri (4), Juhu (3)
- Rank vs team: #2 of 5
```

### Notifications
```
Bell icon shows:
  - New lead assigned (2)
  - Follow-up due (3)
  - Site visit confirmed (1)
  - AI escalation: "Customer asked for human" (1)
  - CRM sync failed (0)

Settings:
  - Email: Daily summary, urgent only, none
  - WhatsApp: New leads, follow-up reminders
  - In-app: All notifications
```
