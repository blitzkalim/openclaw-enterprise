# EPIC 5 — Secure File Access Enforcement

---

## 🧾 SEC-1: BullMQ Job Payload HMAC Signing (Tamper Protection)

### 🎯 Description

Sign every BullMQ job payload with HMAC-SHA256 using `OPENCLAW_QUEUE_SECRET`. The Agent Worker verifies the HMAC before processing. This prevents a compromised or misconfigured process from injecting crafted jobs with a fake `userId` into the Redis queue.

Source: `10-security-model/README.md` — "Threat 3 — BullMQ Job Tampering" (exact code provided in design).

### ⚙️ Implementation Details

**Files to create:**
- `services/shared/src/crypto/hmac.ts` (shared HMAC utility)
- `services/gateway/src/job-signing.ts` (sign at enqueue)
- `services/agent-worker/src/job-signing.ts` (verify at dequeue)

**Signing algorithm:**
```ts
// Gateway side — sign before enqueue
const { _sig, ...payload } = job.data;  // Strip _sig if somehow present
const sig = createHmac('sha256', OPENCLAW_QUEUE_SECRET)
  .update(JSON.stringify(payload))
  .digest('hex');
await queue.add('agent-job', { ...payload, _sig: sig });

// Worker side — verify before processing
const { _sig, ...payload } = job.data;
const expected = createHmac('sha256', OPENCLAW_QUEUE_SECRET)
  .update(JSON.stringify(payload))
  .digest('hex');
if (!timingSafeEqual(Buffer.from(_sig), Buffer.from(expected))) {
  throw new Error('Job signature mismatch — possible tampering');
}
```

**Shared secret:** `OPENCLAW_QUEUE_SECRET` — 32 random bytes, stored as K8s Secret, mounted in both Gateway and Agent Worker Pods.

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer working on security-critical code.

Task:
Create services/shared/src/crypto/hmac.ts
And implement signJobPayload / verifyJobPayload in the gateway and agent-worker services.

For hmac.ts:
  import { createHmac, timingSafeEqual } from 'node:crypto'

  Export function signPayload(payload: object, secret: string): string:
    const json = JSON.stringify(payload)
    return createHmac('sha256', secret).update(json).digest('hex')

  Export function verifyPayload(payload: object, sig: string, secret: string): boolean:
    const expected = signPayload(payload, secret)
    try:
      return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
    catch:
      return false  // Different lengths would throw from timingSafeEqual

For gateway's queue-producer.ts, update enqueueAgentJob:
  - Before calling queue.add:
    const { ...payloadWithoutSig } = payload  // Ensure no _sig in payload
    const _sig = signPayload(payloadWithoutSig, process.env.OPENCLAW_QUEUE_SECRET!)
    const signedPayload = { ...payloadWithoutSig, _sig }
  - Enqueue signedPayload

For agent-worker's job-processor.ts, add at top of processJob:
  Export function verifyJobSignature(jobData: AgentJobPayload & { _sig?: string }): void:
    const { _sig, ...payload } = jobData
    if (!_sig):
      throw new Error('Job missing signature — rejecting')
    const valid = verifyPayload(payload, _sig, process.env.OPENCLAW_QUEUE_SECRET!)
    if (!valid):
      throw new Error('Job signature mismatch — possible queue tampering, rejecting')
    // Log at warn level for signature failures (before throwing)

Constraints:
  - timingSafeEqual MUST be used — never use === for HMAC comparison
  - Both gateway and worker must have OPENCLAW_QUEUE_SECRET set — fail fast if missing
  - JSON.stringify order matters — must be deterministic (same key order)
  - TypeScript strict mode

Output: hmac.ts, updated queue-producer.ts snippet, verifyJobSignature function
```

### 🧪 Testing Instructions

```
1. Unit test signPayload + verifyPayload:
   const sig = signPayload({ userId: 'abc', text: 'hello' }, 'secret123')
   verifyPayload({ userId: 'abc', text: 'hello' }, sig, 'secret123') → true
   verifyPayload({ userId: 'abc', text: 'hello TAMPERED' }, sig, 'secret123') → false
   verifyPayload({ userId: 'abc', text: 'hello' }, sig, 'wrongsecret') → false

2. Integration test — tampered job:
   - Enqueue a job normally
   - Before it is processed: directly edit the job data in Redis (BullMQ data)
   - Change userId to 'admin'
   - Worker processes → should throw 'signature mismatch' and go to DLQ

3. Missing signature:
   - Inject a job directly into Redis without _sig field
   - Worker should throw 'missing signature'

4. Valid end-to-end:
   - Gateway enqueues job with correct _sig
   - Worker verifies → processes normally
```

### 📥 Example Input

```ts
// Gateway:
const sig = signPayload({ userId: 'amit-uuid', text: 'Add lead' }, process.env.OPENCLAW_QUEUE_SECRET!);
// sig: 'a1b2c3d4e5...' (64 hex chars)

// Worker:
verifyJobSignature({ userId: 'amit-uuid', text: 'Add lead', _sig: sig });
// → passes (no throw)

// Tampered:
verifyJobSignature({ userId: 'admin', text: 'Add lead', _sig: sig });
// → throws 'Job signature mismatch'
```

### 📤 Expected Output

```
Valid job → processJob proceeds
Tampered job → Error thrown → BullMQ retries → after 3 failures → DLQ
```

### ✅ Acceptance Criteria

- [ ] `signPayload` produces deterministic HMAC-SHA256 hex string
- [ ] `verifyPayload` uses `timingSafeEqual` (no timing attack)
- [ ] Gateway signs ALL job payloads before enqueueing
- [ ] Agent Worker verifies signature BEFORE any file/S3 operations
- [ ] Missing signature → throws
- [ ] Tampered payload → throws → BullMQ retries → DLQ after 3 failures
- [ ] Missing `OPENCLAW_QUEUE_SECRET` → process fails at startup

---

## 🧾 SEC-2: Redis Pub/Sub Reply Signing (Injection Protection)

### 🎯 Description

Sign agent reply messages published to Redis Pub/Sub with HMAC-SHA256. The Gateway Pod verifies the signature before sending the outbound WhatsApp/Telegram message. This prevents an attacker from publishing a fake reply to send arbitrary messages to users' phones.

Source: `10-security-model/README.md` — "Threat 6 — Redis Pub/Sub Message Injection".

### ⚙️ Implementation Details

**Same HMAC utility as SEC-1** — reuse `signPayload`/`verifyPayload` from `services/shared/src/crypto/hmac.ts`.

**Agent Worker (publisher):**
```ts
// In stream-publisher.ts
const reply = { channel, threadId, userId, text, timestamp };
const _sig = signPayload(reply, process.env.OPENCLAW_QUEUE_SECRET!);
await redis.publish('agent:reply:' + channel + ':' + threadId, JSON.stringify({ ...reply, _sig }));
```

**Gateway (subscriber/verifier):**
```ts
// In channel-reply.ts
sub.on('pmessage', async (pattern, ch, message) => {
  const data = JSON.parse(message);
  const { _sig, ...reply } = data;
  if (!verifyPayload(reply, _sig, process.env.OPENCLAW_QUEUE_SECRET!)) {
    logger.error('Reply HMAC mismatch — dropping');
    return;  // Do NOT send outbound message
  }
  // Proceed with sending
});
```

**Note:** Both Gateway and Agent Worker must share the same `OPENCLAW_QUEUE_SECRET`.

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Update services/agent-worker/src/stream-publisher.ts and services/gateway/src/channel-reply.ts
to add HMAC signing/verification on reply messages.

In stream-publisher.ts:
  - Import { signPayload } from shared/src/crypto/hmac
  
  Update publishReply:
    const { _sig: _, ...replyBody } = reply  // Ensure no _sig in body
    const _sig = signPayload(replyBody, process.env.OPENCLAW_QUEUE_SECRET!)
    const signedReply = { ...replyBody, _sig }
    const channel = 'agent:reply:' + reply.channel + ':' + reply.threadId
    await redis.publish(channel, JSON.stringify(signedReply))

In channel-reply.ts:
  - Import { verifyPayload } from shared/src/crypto/hmac
  
  Update the pmessage handler:
    const data = JSON.parse(message)
    const { _sig, ...replyBody } = data
    
    if (!_sig):
      logger.error({ channel: ch } 'Reply message missing HMAC signature — dropping')
      return
    
    if (!verifyPayload(replyBody, _sig, process.env.OPENCLAW_QUEUE_SECRET!)):
      logger.error({ channel: ch } 'Reply HMAC verification failed — possible injection attempt — dropping')
      return
    
    // Proceed with send...

Export function verifyReplySignature(reply: AgentReplyMessage & { _sig?: string }): void:
  const { _sig, ...body } = reply
  if (!_sig || !verifyPayload(body, _sig, process.env.OPENCLAW_QUEUE_SECRET!)):
    throw new Error('Reply signature invalid')

Constraints:
  - timingSafeEqual used inside verifyPayload
  - Failed verification: log ERROR + return (do NOT send to channel)
  - Missing _sig treated same as failed verification
  - TypeScript strict mode

Output: Updated stream-publisher.ts and channel-reply.ts snippets
```

### 🧪 Testing Instructions

```
1. Publish a valid signed reply:
   const reply = { channel: 'telegram', threadId: '8675309', text: 'Test', userId: 'u1' }
   const sig = signPayload(reply, secret)
   redis.publish('agent:reply:telegram:8675309', JSON.stringify({ ...reply, _sig: sig }))
   → Gateway sends message via Telegram API

2. Publish without signature:
   redis.publish('agent:reply:telegram:8675309', JSON.stringify({ channel: 'telegram', text: 'INJECTED' }))
   → Gateway drops, error logged, Telegram API NOT called

3. Publish with wrong signature:
   Same as step 2 but with _sig: 'badhex'
   → Gateway drops, error logged

4. Publish with tampered text (but valid sig on original):
   sig = signPayload({ channel: 'telegram', text: 'original' }, secret)
   Publish: { channel: 'telegram', text: 'EVIL MESSAGE', _sig: sig }
   → HMAC check fails (text doesn't match what was signed) → drops
```

### 📥 Example Input

```ts
// Agent Worker publishes:
await publishReply({
  channel: 'whatsapp',
  threadId: '+919876543210',
  userId: 'amit-uuid',
  text: 'Got it — created lead Rahul.'
});
```

### 📤 Expected Output

```
// Redis message:
{ channel: 'whatsapp', threadId: '+919876543210', userId: 'amit-uuid', text: '...', _sig: 'abcdef...' }

// Gateway verifies HMAC, sends via Meta API
// Meta API called with correct payload
```

### ✅ Acceptance Criteria

- [ ] Agent Worker signs every reply with HMAC before publishing
- [ ] Gateway verifies HMAC before sending outbound message
- [ ] Missing or invalid signature → message dropped, error logged
- [ ] Tampered text (sig doesn't match body) → dropped
- [ ] `timingSafeEqual` used (not string `===`)

---

## 🧾 SEC-3: CSRF Protection (Signed JTI Hash in Forms)

### 🎯 Description

Implement CSRF protection for write endpoints (`POST`, `DELETE` on `/team/*`). The CSRF token is a signed HMAC of the session's `jti` using `OPENCLAW_COOKIE_SECRET` — no extra DB state required. The token is embedded in server-rendered HTML forms and validated on submit.

Source: `03-auth-design/README.md` — "CSRF Protection" section.

### ⚙️ Implementation Details

**Files to modify:**
- `services/gateway/src/auth-middleware.ts` (add CSRF check middleware)
- `services/gateway/src/web/team.html` (embed CSRF token in forms)
- `services/gateway/src/team-routes.ts` (use csrfProtect middleware)

**CSRF token generation:**
```ts
function generateCsrfToken(jti: string, secret: string): string {
  return createHmac('sha256', secret).update(jti).digest('hex');
}

function verifyCsrfToken(jti: string, token: string, secret: string): boolean {
  const expected = generateCsrfToken(jti, secret);
  return timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
}
```

**How to inject into templates:**
```html
<!-- In team.html forms -->
<input type="hidden" name="_csrf" value="{{csrfToken}}">
```

**Middleware:** For all `POST`, `DELETE` requests to `/team/*`, verify `req.body._csrf` or `req.headers['x-csrf-token']`.

**JWT cookie is already `SameSite=Lax`** — primary CSRF defense. CSRF token is defense-in-depth.

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Add CSRF protection to the Gateway Pod.

Create services/gateway/src/csrf.ts:
  import { createHmac, timingSafeEqual } from 'node:crypto'
  
  const CSRF_SECRET = process.env.OPENCLAW_COOKIE_SECRET || ''
  
  Export function generateCsrfToken(jti: string): string:
    return createHmac('sha256', CSRF_SECRET).update(jti).digest('hex')
  
  Export function verifyCsrfToken(jti: string, token: string): boolean:
    if (!token || token.length !== 64): return false
    const expected = generateCsrfToken(jti)
    try:
      return timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))
    catch:
      return false
  
  Export function csrfProtect(req, res, next):
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)): return next()
    const jti = req.team?.jti  // Must be attached to req.team by authMiddleware
    if (!jti): return res.status(403).json({ error: 'CSRF validation requires session' })
    
    const token = req.body?._csrf || req.headers['x-csrf-token']
    if (!verifyCsrfToken(jti, token)):
      logger.warn({ userId: req.team?.userId, path: req.path } 'CSRF token invalid')
      return res.status(403).json({ error: 'Invalid CSRF token' })
    next()

Update authMiddleware to attach jti to req.team:
  When JWT cookie is verified successfully:
  req.team = { ..., jti: payload.jti }

Update team.html to include CSRF token:
  Server-side: res.render('team.html', { csrfToken: generateCsrfToken(req.team.jti) })
  In every form: <input type="hidden" name="_csrf" value="{{csrfToken}}">

Apply csrfProtect to all /team/* write routes:
  router.post('/team/*', authMiddleware, csrfProtect, handler)
  router.delete('/team/*', authMiddleware, csrfProtect, handler)

Note: API token auth (ocp_ tokens) uses Authorization header, so no CSRF needed for those
  → csrfProtect skips check when req.team.source === 'api-token' or 'legacy'

Constraints:
  - timingSafeEqual for all CSRF comparisons
  - Only applies to cookie-based sessions (not API tokens or legacy)
  - OPENCLAW_COOKIE_SECRET must be set
  - TypeScript strict mode

Output: csrf.ts + updated authMiddleware + team.html form example
```

### 🧪 Testing Instructions

```
1. Test CSRF token generation:
   const token = generateCsrfToken('sess_jti_123')
   verifyCsrfToken('sess_jti_123', token) → true
   verifyCsrfToken('sess_jti_123', 'badtoken') → false
   verifyCsrfToken('other_jti', token) → false

2. Test CSRF middleware:
   POST /team/users without _csrf field → 403
   POST /team/users with wrong _csrf → 403
   POST /team/users with correct _csrf → proceeds to handler

3. Test HTML form contains CSRF token:
   GET /team → HTML response
   → grep for <input type="hidden" name="_csrf"> in response body

4. API token request (no CSRF required):
   POST /team/users with Authorization: Bearer ocp_... (no _csrf)
   → 200 (no CSRF required for API token auth)

5. Cross-origin POST attempt:
   POST /team/users from a different origin
   → SameSite=Lax cookie not sent → authMiddleware rejects (401)
   (Double protection: SameSite + CSRF token)
```

### 📥 Example Input

```html
<!-- Form in team.html -->
<form method="POST" action="/team/users">
  <input type="hidden" name="_csrf" value="a1b2c3d4e5f6...64chars">
  <input name="email" placeholder="Email">
  <button type="submit">Invite User</button>
</form>
```

### 📤 Expected Output

```
POST /team/users with correct _csrf → 201 (user created)
POST /team/users without _csrf → 403 { "error": "Invalid CSRF token" }
```

### ✅ Acceptance Criteria

- [ ] CSRF token is HMAC of session `jti` (no extra DB state)
- [ ] CSRF token embedded in server-rendered HTML forms
- [ ] `POST`, `DELETE`, `PUT`, `PATCH` to `/team/*` require CSRF token
- [ ] `timingSafeEqual` for comparison
- [ ] API token and legacy auth skip CSRF (header-based auth, not cookie)
- [ ] Invalid or missing CSRF → 403

---

## 🧾 SEC-4: Kubernetes Network Policies (Pod Communication Restrictions)

### 🎯 Description

Define Kubernetes `NetworkPolicy` resources that restrict inter-Pod communication: Gateway Pod can only reach Infra (Postgres/Redis) and MinIO on specific ports; Agent Worker Pod cannot receive inbound traffic (queue consumer only); Infra Pod accepts connections only from Gateway and Agent Worker.

Source: `07-kubernetes-deployment/README.md` — "Network Policies" section (exact YAML provided).

### ⚙️ Implementation Details

**Files to create:**
- `charts/openclaw/templates/networkpolicy.yaml`

**Three policies:**
1. `gateway-policy` — Ingress from ingress-controller (8080/8081); Egress to infra (5432/6379), minio (9000), external HTTPS (443)
2. `agent-worker-policy` — No ingress; Egress to infra, minio, browser-pool (50051), external HTTPS
3. `infra-policy` — Ingress only from gateway+agent-worker on 5432/6379; No egress

**Pod labels used:**
- `app: openclaw-gateway`
- `app: openclaw-agent-worker`
- `app: openclaw-infra`
- `app: openclaw-minio`
- `app: openclaw-browser-pool`

### 🤖 AI CODING PROMPT

```text
You are a Kubernetes/Helm expert.

Task:
Create charts/openclaw/templates/networkpolicy.yaml

Requirements:
Write THREE NetworkPolicy resources in a single YAML file (separated by ---).

1. gateway NetworkPolicy:
   name: openclaw-gateway-policy
   podSelector: matchLabels: app: openclaw-gateway
   policyTypes: [Ingress, Egress]
   ingress:
     - from: [namespaceSelector: {}]  # Allow ingress controller
       ports: [8080, 8081]
   egress:
     - to: [podSelector: { app: openclaw-infra }] ports: [5432, 6379]
     - to: [podSelector: { app: openclaw-minio }] ports: [9000]
     - to: [] ports: [443]  # External (Meta API, Telegram API, LLM APIs)
     - to: [] ports: [53]   # DNS resolution (UDP + TCP)

2. agent-worker NetworkPolicy:
   name: openclaw-agent-worker-policy
   podSelector: matchLabels: app: openclaw-agent-worker
   policyTypes: [Ingress, Egress]
   ingress: []  # No inbound — queue consumer only
   egress:
     - to: [podSelector: { app: openclaw-infra }] ports: [5432, 6379]
     - to: [podSelector: { app: openclaw-minio }] ports: [9000]
     - to: [podSelector: { app: openclaw-browser-pool }] ports: [50051]
     - to: [] ports: [443]  # LLM APIs, external
     - to: [] ports: [53]   # DNS

3. infra NetworkPolicy:
   name: openclaw-infra-policy
   podSelector: matchLabels: app: openclaw-infra
   policyTypes: [Ingress, Egress]
   ingress:
     - from: [podSelector: { app: openclaw-gateway }, podSelector: { app: openclaw-agent-worker }]
       ports: [5432, 6379]
   egress: []  # No outbound initiated by infra

Add to values.yaml:
  networkPolicies:
    enabled: true  # Set false to disable (for dev environments without Calico/Cilium)

Wrap each policy in: {{ if .Values.networkPolicies.enabled }}

Use namespace: {{ .Release.Namespace }}

Constraints:
  - Include DNS (port 53 UDP+TCP) in all egress rules or pods cannot resolve hostnames
  - Port lists must be as minimal as possible (principle of least privilege)
  - Use podSelector not ipBlock for inter-pod rules

Output: Complete networkpolicy.yaml Helm template
```

### 🧪 Testing Instructions

```
1. Deploy to a cluster with Calico or Cilium CNI:
   helm install openclaw charts/openclaw/ -f values-dev.yaml

2. Verify gateway can reach Postgres:
   kubectl exec -it deploy/gateway -- psql $DATABASE_URL -c 'SELECT 1'
   → Should succeed

3. Verify gateway CANNOT reach agent-worker Pod directly:
   kubectl exec -it deploy/gateway -- curl http://agent-worker:3000/health
   → Connection timeout (NetworkPolicy blocks it)

4. Verify agent-worker CANNOT receive inbound:
   kubectl exec -it deploy/gateway -- curl http://agent-worker:3000
   → Connection timeout

5. Verify agent-worker can reach Redis:
   kubectl exec -it deploy/agent-worker -- redis-cli -u $REDIS_URL ping
   → PONG

6. Verify infra Pod cannot initiate outbound:
   kubectl exec -it statefulset/infra -- curl https://example.com
   → Connection timeout (infra egress: [])
```

### 📥 Example YAML

```yaml
# Snippet from networkpolicy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: openclaw-agent-worker-policy
  namespace: {{ .Release.Namespace }}
spec:
  podSelector:
    matchLabels:
      app: openclaw-agent-worker
  policyTypes:
    - Ingress
    - Egress
  ingress: []
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: openclaw-infra
      ports:
        - port: 5432
        - port: 6379
```

### 📤 Expected Output

```
$ kubectl get networkpolicies -n openclaw
NAME                          POD-SELECTOR
openclaw-gateway-policy       app=openclaw-gateway
openclaw-agent-worker-policy  app=openclaw-agent-worker
openclaw-infra-policy         app=openclaw-infra
```

### ✅ Acceptance Criteria

- [ ] Agent Worker Pod has NO inbound rules (queue consumer only)
- [ ] Gateway Pod can reach Infra on 5432/6379 but NOT agent-worker
- [ ] Agent Worker Pod can reach Infra on 5432/6379 but NOT gateway
- [ ] Infra Pod only accepts connections from gateway+worker on DB ports
- [ ] All Pods include DNS egress (port 53) for hostname resolution
- [ ] Policies are enabled/disabled via `networkPolicies.enabled` Helm value
