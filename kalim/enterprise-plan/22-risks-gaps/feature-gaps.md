# Feature Gaps

## Purpose
Document missing features and architectural limitations.

## Findings

## AUTH & ACCESS CONTROL

| Gap | Impact | Status |
|-----|--------|--------|
| Multi-user support | Cannot share instance safely | By design (single-user) |
| RBAC / roles | No permission levels | By design |
| OAuth / SSO | No external identity provider | Not implemented |
| MFA / 2FA | No multi-factor authentication | Not implemented |
| API key rotation | Manual only, no automation | Not implemented |
| Session timeout | No automatic session expiry | Not implemented |
| Audit log | No immutable access log | Not implemented |

## INFRASTRUCTURE

| Gap | Impact | Status |
|-----|--------|--------|
| Horizontal scaling | Single process only | By design |
| High availability | No failover / replication | Not implemented |
| Kubernetes native | No Helm / K8s manifests | Community gap |
| Cloud multi-region | Single region deployment | Not implemented |
| Database server | No PostgreSQL / MySQL option | By design (file-based) |
| Redis / cache | No external caching layer | Not implemented |
| CDN integration | No asset CDN support | Not implemented |

## MONITORING & OBSERVABILITY

| Gap | Impact | Status |
|-----|--------|--------|
| Prometheus metrics | No `/metrics` endpoint | Not implemented |
| Grafana dashboard | No pre-built dashboards | Not implemented |
| Alerting | No built-in alerting | Not implemented |
| Performance profiling | No continuous profiling | Not implemented |
| Error tracking | No Sentry / Bugsnag integration | Not implemented |
| Health detail | Binary healthy/unhealthy only | Partial (no subsystem detail) |

## DATA & BACKUP

| Gap | Impact | Status |
|-----|--------|--------|
| Automated backup | No scheduled backup mechanism | Not implemented |
| Point-in-time recovery | No snapshot / restore | Manual only |
| Data encryption | No encryption at rest | Not implemented |
| Config versioning | No Git-backed config history | Manual only |
| Export / import | No full instance migration tool | Partial (file copy) |
| Archival | No cold storage for old sessions | Not implemented |

## MESSAGING & CHANNELS

| Gap | Impact | Status |
|-----|--------|--------|
| Email channel | No SMTP / IMAP integration | Not implemented |
| SMS channel | No Twilio / SMS gateway | Not implemented |
| Webhook inbound | Limited generic webhook support | Partial |
| Message queue | No guaranteed delivery retry | Partial (SQLite queue) |
| Message threading | Limited cross-channel threading | Platform-specific |
| Read receipts | Not consistently supported | Channel-specific |

## AGENTS & AI

| Gap | Impact | Status |
|-----|--------|--------|
| Agent memory persistence | Session-level only (no cross-session) | Partial (LanceDB) |
| Multi-agent coordination | No formal agent orchestration | Partial (subagents) |
| Agent marketplace | No discoverable agent sharing | Not implemented |
| Fine-tuning | No custom model fine-tuning | Not implemented |
| Cost tracking | No per-request cost analytics | Not implemented |
| Token budget | No usage limits or budgets | Not implemented |
| Model fallback | Manual only, no automatic failover | Partial |

## EXTENSIONS & PLUGINS

| Gap | Impact | Status |
|-----|--------|--------|
| Plugin sandbox | Weak isolation (same process) | Known limitation |
| Plugin marketplace | No official store | Not implemented |
| Plugin signing | No cryptographic verification | Not implemented |
| Plugin permissions | No capability model | Not implemented |
| Plugin API versioning | Limited backward compatibility | Partial |
| Hot reload | Requires gateway restart for config | Not implemented |

## UI / UX

| Gap | Impact | Status |
|-----|--------|--------|
| Mobile app | Web UI responsive, no native mobile app | Partial (PWA) |
| Offline mode | No offline functionality | Not implemented |
| Search | Limited full-text search | Partial |
| Keyboard shortcuts | Basic shortcuts only | Not comprehensive |
| Themes | Dark/light only, no custom themes | Limited |
| Accessibility | ARIA support partial | Needs audit |

## COMPLIANCE

| Gap | Impact | Status |
|-----|--------|--------|
| GDPR | No data deletion / export tools | Not implemented |
| SOC 2 | No compliance controls | Not applicable (personal use) |
| HIPAA | Not healthcare compliant | Not applicable |
| Data residency | No region selection | Not implemented |

## Evidence
- Architecture documentation
- `README.md` feature list
- `package.json` dependencies
- Extension directory review
- Config schema review

## Notes
- Many gaps are intentional (personal assistant scope)
- Not designed as enterprise SaaS
- File-based architecture limits some features
- Community extensions may fill some gaps
- Prioritize based on deployment context (personal vs. team)
