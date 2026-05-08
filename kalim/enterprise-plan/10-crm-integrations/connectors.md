# CRM Connectors

## Supported CRMs

| CRM | Tier | API Type | Difficulty |
|-----|------|----------|------------|
| Zoho CRM | Pro | REST OAuth | Easy |
| HubSpot | Pro | REST API Key | Easy |
| Salesforce | Enterprise | REST OAuth | Medium |
| Google Sheets | Pro | REST OAuth | Easy |
| Airtable | Pro | REST API Key | Easy |
| Pipedrive | Pro | REST API Key | Easy |
| Custom Webhook | Enterprise | HTTP POST | Easy |

## Connector Architecture

```
OpenClaw Gateway
  -> CRM Sync Job (BullMQ)
    -> Connector Registry
      -> Zoho Connector
      -> HubSpot Connector
      -> Salesforce Connector
      -> ...
        -> External CRM API
          -> Response / Error
```

## Zoho CRM Connector (Example)

### Authentication

```typescript
// OAuth 2.0 flow
const authUrl = `https://accounts.zoho.com/oauth/v2/auth?` +
  `scope=ZohoCRM.modules.ALL&` +
  `client_id=${clientId}&` +
  `response_type=code&` +
  `redirect_uri=${callbackUrl}&` +
  `access_type=offline`;

// Exchange code for tokens
const tokens = await fetch('https://accounts.zoho.com/oauth/v2/token', {
  method: 'POST',
  body: new URLSearchParams({
    code, client_id, client_secret, grant_type: 'authorization_code'
  })
});

// Store: access_token, refresh_token, expires_at (encrypted)
```

### Data Mapping

```typescript
const LEAD_TO_ZOHO = {
  'First_Name': lead.first_name,
  'Last_Name': lead.last_name,
  'Email': lead.email,
  'Phone': lead.phone,
  'Lead_Source': lead.channel_type, // WhatsApp, Telegram, Web
  'Description': lead.notes,
  'Budget': lead.budget,
  'Property_Type': lead.property_type,
  'Preferred_Location': lead.location,
  'Assigned_To': lead.assigned_to_crm_id,
};
```

### Sync Strategies

| Strategy | Use Case | Implementation |
|----------|----------|----------------|
| Real-time | Hot lead created | Immediate push on lead creation |
| Near-real-time | Normal operations | Queue job, process in < 5 seconds |
| Batch | Daily summary | Cron job, hourly/daily sync |
| On-demand | Manual trigger | Admin clicks "Sync Now" |

### Conflict Resolution

```typescript
enum ConflictStrategy {
  PLATFORM_WINS = 'platform_wins',  // OpenClaw is source of truth
  CRM_WINS = 'crm_wins',            // CRM is source of truth
  LAST_WRITE_WINS = 'last_write', // Timestamp comparison
  MANUAL = 'manual',               // Flag for review
}
```

## HubSpot Connector

```typescript
async function syncLeadToHubSpot(lead: Lead, tenantConfig: HubSpotConfig) {
  const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tenantConfig.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        email: lead.email,
        firstname: lead.first_name,
        lastname: lead.last_name,
        phone: lead.phone,
        lifecyclestage: 'lead',
        lead_source: lead.channel_type,
        // Custom properties
        property_type: lead.property_type,
        preferred_location: lead.location,
        budget_range: lead.budget,
      },
    }),
  });

  return response.json();
}
```

## Salesforce Connector

```typescript
async function syncLeadToSalesforce(lead: Lead, tenantConfig: SalesforceConfig) {
  // Salesforce requires OAuth + instance URL
  const response = await fetch(
    `${tenantConfig.instance_url}/services/data/v59.0/sobjects/Lead/`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenantConfig.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        FirstName: lead.first_name,
        LastName: lead.last_name,
        Email: lead.email,
        Phone: lead.phone,
        Company: lead.company || 'Individual',
        LeadSource: lead.channel_type,
        Description: lead.notes,
        // Custom fields
        Property_Type__c: lead.property_type,
        Preferred_Location__c: lead.location,
        Budget__c: lead.budget,
      }),
    }
  );

  return response.json();
}
```

## Google Sheets Connector

Popular for small agencies:

```typescript
async function appendToSheet(lead: Lead, tenantConfig: SheetsConfig) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${tenantConfig.spreadsheet_id}/values/Leads:append`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenantConfig.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [[
          new Date().toISOString(),
          lead.first_name,
          lead.last_name,
          lead.phone,
          lead.email,
          lead.property_type,
          lead.location,
          lead.budget,
          lead.channel_type,
          lead.status,
        ]],
      }),
    }
  );

  return response.json();
}
```

## Airtable Connector

```typescript
async function createAirtableRecord(lead: Lead, tenantConfig: AirtableConfig) {
  const response = await fetch(
    `https://api.airtable.com/v0/${tenantConfig.base_id}/Leads`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenantConfig.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          'First Name': lead.first_name,
          'Last Name': lead.last_name,
          'Phone': lead.phone,
          'Email': lead.email,
          'Property Type': lead.property_type,
          'Location': lead.location,
          'Budget': lead.budget,
          'Source': lead.channel_type,
          'Status': lead.status,
        },
      }),
    }
  );

  return response.json();
}
```

## Custom Webhook Connector

For enterprise tenants with custom CRM:

```typescript
async function pushToWebhook(lead: Lead, tenantConfig: WebhookConfig) {
  const payload = {
    event: 'lead.created',
    timestamp: new Date().toISOString(),
    tenant_id: lead.tenant_id,
    lead: {
      id: lead.id,
      name: `${lead.first_name} ${lead.last_name}`,
      phone: lead.phone,
      email: lead.email,
      property_type: lead.property_type,
      location: lead.location,
      budget: lead.budget,
      source: lead.channel_type,
      notes: lead.notes,
    },
  };

  const response = await fetch(tenantConfig.webhook_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': tenantConfig.webhook_secret,
    },
    body: JSON.stringify(payload),
  });

  return { success: response.ok, status: response.status };
}
```

## Error Handling & Retry

```typescript
async function syncWithRetry(
  lead: Lead,
  connector: CRMConnector,
  maxRetries: number = 3
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await connector.sync(lead);
    } catch (error) {
      if (attempt === maxRetries) {
        // Log to failed_syncs queue
        await queueFailedSync(lead, connector.name, error);
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      await sleep(1000 * Math.pow(2, attempt - 1));
    }
  }
}
```
