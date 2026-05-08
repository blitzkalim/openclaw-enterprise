# Compliance Framework

## Applicable Regulations

### India
| Regulation | Applies To | Requirements |
|------------|-----------|--------------|
| IT Act 2000 | All | Data protection, breach notification |
| SPDI Rules 2011 | Personal data | Consent, purpose limitation, security |
| DPDP Act 2023 | All digital platforms | Consent manager, data principal rights |
| GST | SaaS | 18% on domestic, 0% on export |
| RBI (if payment processing) | Financial data | PCI-DSS compliance |

### Global
| Regulation | Applies To | Requirements |
|------------|-----------|--------------|
| GDPR | EU users | Consent, right to erasure, data portability |
| CCPA/CPRA | California users | Disclosure, opt-out, deletion |
| SOC 2 Type II | Enterprise customers | Security, availability, confidentiality |
| ISO 27001 | Enterprise customers | ISMS, risk management |

## DPDP Act 2023 (India) Compliance

### Key Requirements
1. **Consent Manager**: Explicit consent for data collection
2. **Data Principal Rights**: Access, correction, erasure, grievance
3. **Data Fiduciary Obligations**: Purpose limitation, storage limitation, security
4. **Breach Notification**: Within 72 hours to Data Protection Board
5. **Cross-border Transfer**: Restrictions on sensitive data to certain countries

### Implementation
```typescript
// Consent collection during signup
interface ConsentRecord {
  userId: string;
  purpose: string;  // 'lead_management', 'marketing', 'analytics'
  granted: boolean;
  grantedAt: Date;
  withdrawnAt?: Date;
  version: string;  // consent text version
}

// Consent stored separately from user data
await db('consents').insert({
  user_id: user.id,
  purpose: 'lead_management',
  granted: true,
  granted_at: new Date(),
  version: 'v1.0',
  consent_text: 'I consent to processing my personal data for real estate lead management...',
});
```

### Data Principal Rights API
```typescript
// GET /api/me/data - Export all personal data
app.get('/api/me/data', requireAuth, async (req, res) => {
  const data = await exportUserData(req.auth.userId);
  res.json(data);  // Machine-readable format (JSON)
});

// DELETE /api/me - Right to erasure
app.delete('/api/me', requireAuth, async (req, res) => {
  await anonymizeUser(req.auth.userId);
  // Keep audit logs (legal obligation exception)
  res.json({ message: 'Account deleted' });
});

// PUT /api/me - Correction
app.put('/api/me', requireAuth, validateInput, async (req, res) => {
  await updateUser(req.auth.userId, req.body);
  res.json({ message: 'Profile updated' });
});
```

## GDPR Compliance

### Lawful Basis
| Processing Activity | Basis |
|-------------------|-------|
| Lead data collection | Legitimate interest (customer service) |
| Marketing emails | Consent |
| Analytics | Legitimate interest |
| AI training data | Consent or anonymization |

### Data Processing Agreement (DPA)
Enterprise customers require DPA:
- We are processor, customer is controller
- Subprocessors listed (OpenAI, AWS, etc.)
- Data retention: customer data deleted 30 days after contract end
- Security measures documented
- Audit rights (annual)

### EU Data Residency
```typescript
// Route EU tenants to EU infrastructure
function getRegion(tenant: Tenant): string {
  if (tenant.country === 'DE' || tenant.country === 'FR' || tenant.country === 'NL') {
    return 'eu-west-1';
  }
  return 'ap-south-1';  // Default India
}
```

## SOC 2 Type II Roadmap

### Phase 1: SOC 2 Readiness (Month 6-12)
- Document all policies (access control, change management, incident response)
- Implement monitoring and alerting
- Conduct internal audit
- Remediate gaps

### Phase 2: Type I Audit (Month 12-15)
- Hire SOC 2 auditor
- Point-in-time audit
- Receive Type I report

### Phase 3: Type II Audit (Month 15-27)
- 12-month observation period
- Continuous monitoring evidence
- Receive Type II report

### Controls Required
| Trust Service Criteria | Controls |
|------------------------|----------|
| Security | Access control, encryption, vulnerability management |
| Availability | Uptime monitoring, backup testing, DR drills |
| Confidentiality | Data classification, encryption in transit/at rest |
| Processing Integrity | Input validation, error handling, audit trails |

## Data Retention Policy

| Data Type | Retention | Legal Basis |
|-----------|-----------|-------------|
| Active leads | 2 years | Business necessity |
| Closed leads | 5 years | Tax/commercial law |
| Conversations | 2 years | Business necessity |
| Audit logs | 7 years | Legal obligation |
| Usage events | 2 years | Business necessity |
| Deleted tenant data | 30 days post-deletion | Data principal right |
| Failed login attempts | 90 days | Security |
| API logs | 90 days | Security |

## Breach Response Plan

```
Detection (monitoring alert)
  -> Triage (severity assessment, 1 hour)
    -> Containment (isolate affected systems, 2 hours)
      -> Investigation (root cause, scope, 24 hours)
        -> Notification (affected tenants, regulators if required, 72 hours)
          -> Remediation (fix, test, deploy, 48 hours)
            -> Post-incident review (document, update controls, 1 week)
```

### Notification Template
```
Subject: Security Incident Notification - [Tenant Name]

Dear [Tenant Admin],

We are writing to inform you of a security incident that may have affected your data.

What happened: [Brief description]
When: [Date/time]
What data: [Specific data types affected]
What we did: [Containment actions]
What you should do: [Recommended actions]
Our commitment: [Remediation and prevention]

Contact: security@openclaw-teamos.com
Reference: INC-2024-XXXX
```

## Compliance Automation

```typescript
// Automated compliance checks (daily)
async function runComplianceChecks() {
  // 1. Check for unencrypted credentials
  const unencrypted = await db('tenant_secrets').whereNull('encrypted_value');
  if (unencrypted.length > 0) alert('Unencrypted secrets found');

  // 2. Check for inactive users with access
  const staleUsers = await db('memberships')
    .where('last_login_at', '<', Date.now() - 90 * 24 * 60 * 60 * 1000)
    .where('status', 'active');
  if (staleUsers.length > 0) alert('Inactive users with active access');

  // 3. Check for expired consents
  const expiredConsents = await db('consents')
    .where('granted', true)
    .where('granted_at', '<', Date.now() - 365 * 24 * 60 * 60 * 1000);
  if (expiredConsents.length > 0) alert('Expired consents need renewal');

  // 4. Verify backup integrity
  const latestBackup = await getLatestBackup();
  if (!latestBackup.verified) alert('Latest backup not verified');
}
```
