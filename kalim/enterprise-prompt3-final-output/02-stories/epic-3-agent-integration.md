# EPIC 3 — Agent Runtime Integration

---

## 🧾 AGENT-1: BullMQ Worker Entry Point and Job Lifecycle

### 🎯 Description

Implement the Agent Worker Pod's entry point: a BullMQ `Worker` that consumes jobs from the `agent-jobs` queue, calls the job processor, and handles graceful shutdown. This is the orchestration layer that replaces the direct HTTP handler invocation from the simple plan.

Source: `05-agent-runtime/README.md` — "Agent Worker Architecture" and `08-code-change-plan/README.md` — "Agent Worker Service".

### ⚙️ Implementation Details

**Files to create:**
- `services/agent-worker/src/index.ts`

**BullMQ configuration:**
```ts
const worker = new Worker('agent-jobs', processJob, {
  connection: redis,
  concurrency: 5,      // Process up to 5 jobs simultaneously per replica
  limiter: { max: 10, duration: 1000 },  // 10 jobs/sec per worker
});
```

**Graceful shutdown:**
```
SIGTERM / SIGINT:
  1. worker.close()   → Stop accepting new jobs, finish current jobs
  2. redis.disconnect()
  3. process.exit(0)
```

**Job retry config:** 3 attempts, exponential backoff starting at 2s, DLQ after all failures.

**Health check:** Export `isWorkerHealthy(): boolean` (used by `/health` endpoint).

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Create services/agent-worker/src/index.ts — BullMQ Worker entry point.

Requirements:

1. Import Worker, QueueEvents from 'bullmq'
2. Import redis singleton from shared/redis/client
3. Import processJob from ./job-processor

4. Create BullMQ Worker:
   const worker = new Worker('agent-jobs', async (job) => {
     await processJob(job);
   }, {
     connection: redis,
     concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5'),
     removeOnComplete: { age: 86400 },
     removeOnFail: { age: 604800 },
   });

5. Worker event handlers:
   worker.on('completed', (job) => {
     logger.info({ jobId: job.id, userId: job.data.userId, duration: Date.now() - job.timestamp }, 'job completed');
   });
   worker.on('failed', (job, err) => {
     logger.error({ jobId: job?.id, userId: job?.data?.userId, err: err.message }, 'job failed');
   });
   worker.on('error', (err) => {
     logger.error({ err: err.message }, 'worker error');
   });

6. Graceful shutdown:
   const shutdown = async () => {
     logger.info('Shutting down agent worker...');
     await worker.close();
     await redis.disconnect();
     process.exit(0);
   };
   process.on('SIGTERM', shutdown);
   process.on('SIGINT', shutdown);

7. Startup validation:
   - Check REDIS_URL, DATABASE_URL, OPENCLAW_S3_BUCKET are set
   - If any missing: log error and exit(1)
   - Check Redis connectivity: redis.ping()
   - Check S3 connectivity: headObject('base/') -- returns false is fine, just test connectivity
   - If connectivity check fails: exit(1)

8. Export function isWorkerHealthy(): boolean
   → return worker.isRunning()

Constraints:
  - Use pino or similar structured logger, NOT console.log
  - OPENCLAW_TEAM_MODE must equal '1' or exit(1)
  - TypeScript strict mode

Output: Complete index.ts
```

### 🧪 Testing Instructions

```
1. docker compose up redis
2. Start agent worker: node dist/services/agent-worker/src/index.js
3. Enqueue a test job:
   const queue = new Queue('agent-jobs', { connection: redis });
   await queue.add('agent-job', { userId: 'test', sessionKey: 'u:test:web:1', text: 'hello', channel: 'web', threadId: 'sess1', timestamp: new Date().toISOString() });
4. Watch agent worker logs → job picked up and processed
5. Test graceful shutdown:
   Kill with SIGTERM while job is in flight
   → Job should complete before shutdown
   → Process exits 0
6. Test startup without REDIS_URL → process exits 1 with error message
7. Test startup with OPENCLAW_TEAM_MODE unset → process exits 1
```

### 📥 Example Input

```ts
// BullMQ job enqueued by gateway
{
  userId: 'amit-uuid',
  workspaceId: null,
  channel: 'whatsapp',
  threadId: '+919876543210',
  sessionKey: 'u:amit-uuid:wa:+919876543210',
  text: 'Add lead Rahul wants 2BHK',
  timestamp: '2026-05-02T10:30:00.000Z'
}
```

### 📤 Expected Output

```
// Worker logs:
{ "level": "info", "jobId": "wamid.abc123", "userId": "amit-uuid" } job started
{ "level": "info", "jobId": "wamid.abc123", "userId": "amit-uuid", "duration": 2341 } job completed
```

### ✅ Acceptance Criteria

- [ ] Worker starts and connects to Redis
- [ ] Worker picks up jobs from `agent-jobs` queue
- [ ] Concurrency configurable via `WORKER_CONCURRENCY` env var
- [ ] Failed jobs retry 3 times with exponential backoff
- [ ] Graceful SIGTERM completes in-flight jobs before exit
- [ ] Startup validation fails fast if env vars missing
- [ ] `isWorkerHealthy()` returns false when worker is stopped

---

## 🧾 AGENT-2: Job Processor (Dequeue → Resolve → Execute → Write Back)

### 🎯 Description

The core of the agent worker: the `processJob` function that orchestrates the full agent execution lifecycle. It dequeues the job, validates the HMAC signature, resolves user files from S3, builds the `TeamCtx`, calls `agent-command.ts`, streams tokens to Redis Pub/Sub, and writes back updated files.

Source: `05-agent-runtime/README.md` — "Job Processing Lifecycle" (all 7 steps).

### ⚙️ Implementation Details

**Files to create:**
- `services/agent-worker/src/job-processor.ts`

**Full lifecycle:**
```
1. Verify HMAC signature on job payload (from Threat 3 mitigation in 10-security-model)
2. Call resolveUserFiles(userId) → UserFiles
3. captureFileHashes(files) → preHashes
4. Build TeamCtx
5. Call agent-command.ts with TeamCtx
   → During execution: publish tokens to Redis pub/sub (stream-publisher)
6. Call writeBackFiles(userId, sessionKey, files, agentOutput)
7. Publish final reply to Redis: agent:reply:{channel}:{threadId}
8. Mark job complete
```

**TeamCtx assembled from job payload:**
```ts
const teamCtx: TeamCtx = {
  userId: job.data.userId,
  workspaceId: job.data.workspaceId,
  isAdmin: job.data.isAdmin,
  source: job.data.source,
  files,
};
```

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Implement services/agent-worker/src/job-processor.ts

Requirements:

Import:
  - { Job } from 'bullmq'
  - { AgentJobPayload, TeamCtx } from '../../../shared/src/types/team-ctx'
  - { resolveUserFiles } from './file-resolver-s3'
  - { captureFileHashes, writeBackFiles } from './write-back'
  - { verifyJobSignature } from './job-signing'
  - { publishStreamToken, publishReply } from './stream-publisher'
  - { runAgent } from '../../../src/agents/agent-command'  [OpenClaw monolith]
  - redis from '../../../shared/src/redis/client'

Export async function processJob(job: Job<AgentJobPayload>): Promise<void>:

  Step 1 — Validate signature:
    verifyJobSignature(job.data)  // throws if HMAC invalid

  Step 2 — Resolve user files:
    const files = await resolveUserFiles(job.data.userId)

  Step 3 — Capture pre-hashes:
    const preHashes = await captureFileHashes(files)

  Step 4 — Build TeamCtx:
    const teamCtx: TeamCtx = { userId, workspaceId, isAdmin, source, files }

  Step 5 — Execute agent:
    const onToken = (token: string) => publishStreamToken(job.data.replyChannel, token)

    const result = await runAgent({
      text: job.data.text,
      attachments: job.data.attachments,
      sessionKey: job.data.sessionKey,
      team: teamCtx,
      onToken,
    })

  Step 6 — Write back files:
    await writeBackFiles(job.data.userId, job.data.sessionKey, files, {
      transcript: result.transcript,
      log: result.log,
      preHashes,
    })

  Step 7 — Publish final reply:
    await publishReply({
      channel: job.data.channel,
      threadId: job.data.threadId,
      userId: job.data.userId,
      text: result.text,
    })

  Step 8 — Done (BullMQ auto-marks as complete)

Error handling:
  - Wrap entire function in try/catch
  - Log error with jobId, userId, error message
  - Rethrow to let BullMQ handle retries
  - Do NOT publish reply on error (BullMQ will retry)

Constraints:
  - HMAC verification MUST happen before ANY file/S3 operations
  - If resolveUserFiles fails: rethrow (retry is appropriate)
  - If writeBackFiles fails: log but do NOT rethrow (job was processed successfully)
  - If publishReply fails: log but do NOT rethrow
  - TypeScript strict mode

Output: Complete job-processor.ts
```

### 🧪 Testing Instructions

```
1. Unit test with mocked S3, Redis, and agent-command
2. Test happy path:
   - Mock resolveUserFiles → returns valid UserFiles
   - Mock runAgent → returns { text: 'reply', transcript: '...', log: '...' }
   - Mock writeBackFiles → resolves
   - Mock publishReply → resolves
   - Call processJob with valid job
   → All mocks called in order
3. Test HMAC failure:
   - Craft job with invalid _sig field
   - processJob → should throw (and BullMQ retries)
4. Test resolveUserFiles failure:
   - Mock throws 'S3 connection error'
   - processJob → rethrows (BullMQ retries)
5. Test writeBackFiles failure:
   - Mock writeBack throws
   - processJob → does NOT rethrow (job marked complete, error logged)
6. Integration test (Docker Compose):
   - Enqueue real job, real S3, real Redis
   - Verify S3 files updated, Redis reply published
```

### 📥 Example Input

```ts
// BullMQ job.data
{
  userId: 'amit-uuid', workspaceId: null, isAdmin: false, source: 'cookie',
  channel: 'whatsapp', threadId: '+919876543210',
  sessionKey: 'u:amit-uuid:wa:+919876543210',
  text: 'Add lead Rahul wants 2BHK in Bandra',
  _sig: 'hmac_signature_here',
  timestamp: '2026-05-02T10:30:00Z'
}
```

### 📤 Expected Output

```
// Redis pub/sub published:
channel: 'agent:reply:whatsapp:+919876543210'
data: { text: "Got it — created lead 'Rahul'...", channel: 'whatsapp', threadId: '...' }

// S3 updated:
users/user_amit-uuid/MEMORY.md (updated)
users/user_amit-uuid/conversations/u:amit-uuid:wa:+91....jsonl (created)
```

### ✅ Acceptance Criteria

- [ ] HMAC verification runs before any S3 operations
- [ ] User files resolved from S3 before agent execution
- [ ] Agent executed with correct TeamCtx
- [ ] LLM tokens streamed to Redis Pub/Sub during execution
- [ ] Modified files uploaded to S3 after execution
- [ ] Final reply published to `agent:reply:{channel}:{threadId}`
- [ ] write-back failure doesn't fail the job
- [ ] Error in agent execution → rethrow for BullMQ retry

---

## 🧾 AGENT-3: Redis Pub/Sub Stream Publisher (LLM Tokens → Browser)

### 🎯 Description

Implement the stream publisher that writes LLM tokens to Redis Pub/Sub as they are generated, enabling real-time streaming to the browser via the Gateway's WebSocket relay. Also implement the reply publisher for outbound channel messages.

Source: `02-service-contracts/README.md` — "Redis Pub/Sub Schemas", `01-architecture-overview/README.md` — "Flow 3 — WebSocket Agent Stream".

### ⚙️ Implementation Details

**Files to create:**
- `services/agent-worker/src/stream-publisher.ts`

**Pub/Sub channel patterns:**
- Streaming: `agent:stream:{sessionKey}` (one message per token)
- Reply: `agent:reply:{channel}:{threadId}` (one final message)

**AgentStreamMessage type:**
```ts
interface AgentStreamMessage {
  type: 'token' | 'tool_call' | 'tool_result' | 'done' | 'error';
  sessionKey: string;
  data: string;
  timestamp: string;
}
```

**Gateway WebSocket relay (ws-relay.ts):**
```ts
// Gateway subscribes when WS client connects
const sub = redis.duplicate();
await sub.subscribe('agent:stream:' + sessionKey);
sub.on('message', (channel, message) => {
  ws.send(message);  // Forward to browser
});
```

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Create services/agent-worker/src/stream-publisher.ts AND
Create services/gateway/src/ws-relay.ts

For stream-publisher.ts:

Import redis from shared/redis/client
Import { AgentStreamMessage, AgentReplyMessage } from shared/types/team-ctx

Export async function publishStreamToken(replyChannel: string, token: string): Promise<void>:
  - If replyChannel is null/undefined: return (no-op — webhook channels don't stream)
  - const msg: AgentStreamMessage = { type: 'token', sessionKey: replyChannel.split(':').slice(2).join(':'), data: token, timestamp: new Date().toISOString() }
  - await redis.publish(replyChannel, JSON.stringify(msg))

Export async function publishStreamDone(replyChannel: string): Promise<void>:
  - const msg: AgentStreamMessage = { type: 'done', sessionKey: '...', data: '', timestamp: ... }
  - await redis.publish(replyChannel, JSON.stringify(msg))

Export async function publishReply(reply: AgentReplyMessage): Promise<void>:
  - const channel = 'agent:reply:' + reply.channel + ':' + reply.threadId
  - await redis.publish(channel, JSON.stringify(reply))

For ws-relay.ts in services/gateway/src/:

Export function createWsServer(httpServer: http.Server): WebSocketServer:
  - ws = new WebSocketServer({ server: httpServer, path: '/ws' })
  - ws.on('connection', async (socket, req) => {
      1. Extract JWT from query param or cookie
      2. Verify JWT → if invalid, socket.close(1008, 'Unauthorized'); return
      3. Check Redis session:{jti} → if missing, socket.close(1008, 'Session revoked'); return
      4. Create a subscriber Redis client (redis.duplicate())
      5. const sessionChannel = 'agent:stream:u:' + userId + ':web:' + generateSessionId()
      6. await subscriber.subscribe(sessionChannel)
      7. subscriber.on('message', (ch, msg) => socket.send(msg))
      8. socket.on('message', async (data) => {
           // User sent a message → enqueue to BullMQ
           const text = JSON.parse(data.toString()).text
           await agentJobsQueue.add('agent-job', {
             userId, channel: 'web', text, sessionKey, replyChannel: sessionChannel, ...
           })
         })
      9. socket.on('close', () => { subscriber.unsubscribe(); subscriber.disconnect(); })
    })

Constraints:
  - Each WebSocket connection must have its OWN Redis subscriber client (not shared)
  - JWT validation must happen BEFORE subscribing to any Redis channel
  - WebSocket path is '/ws'
  - TypeScript strict mode

Output: Both complete files
```

### 🧪 Testing Instructions

```
1. Start full Docker Compose stack
2. Login via browser, open WebSocket connection
3. Type a message in the UI
4. Verify: each LLM token appears in browser in real time
5. Monitor Redis: SUBSCRIBE agent:stream:u:amit:web:sess1 → tokens published
6. Verify 'done' message arrives at end
7. Test session revocation during stream:
   - DEL session:{jti} from Redis while streaming
   - New messages should return 401 (WS reconnect required)
8. Test concurrent users:
   - Two browser tabs logged in as different users
   - Both receive their own agent responses (no cross-contamination)
```

### 📥 Example Input

```
WSS /ws?token=<JWT>
→ Client sends: { "text": "What's Rahul's status?" }
```

### 📤 Expected Output

```
→ Streaming tokens over WebSocket:
{"type":"token","data":"Rahul","timestamp":"..."}
{"type":"token","data":" is","timestamp":"..."}
{"type":"token","data":" a qualified","timestamp":"..."}
...
{"type":"done","data":"","timestamp":"..."}
```

### ✅ Acceptance Criteria

- [ ] Each WebSocket connection validated with JWT
- [ ] Revoked sessions rejected at connection time
- [ ] Tokens published to `agent:stream:{sessionKey}` as LLM generates
- [ ] Gateway relays tokens to browser via WebSocket
- [ ] `done` message sent at end of streaming
- [ ] Two concurrent users receive independent streams (no mixing)
- [ ] WebSocket disconnect cleans up Redis subscriber

---

## 🧾 AGENT-4: Patch agent-command.ts to Accept TeamCtx

### 🎯 Description

Apply the +25-line patch to the existing OpenClaw monolith's `src/agents/agent-command.ts` to accept a `team` context object, read per-user overlay files when team mode is enabled, and write updated memory back. This is the only patch required to the core agent runtime.

Source: `08-code-change-plan/README.md` — "Patches to OpenClaw Monolith" table.

### ⚙️ Implementation Details

**File to modify:** `src/agents/agent-command.ts`

**What changes:**
- Accept optional `team?: TeamCtx` parameter in the agent execution function signature
- When `team` is present: read SOUL.md, AGENTS.md, MEMORY.md, USER.md, TASKS.md from `team.files` paths (already downloaded to local scratch by `file-resolver-s3.ts`)
- When `team` is absent: existing behavior (backward compat — single-process mode still works)
- Session key: when `team` present, prefix session key as `u:{userId}:{channel}:{threadId}`
- `onToken` callback: accept an optional `onToken: (token: string) => void` for streaming

**Key constraint:** The monolith MUST work without team mode (`OPENCLAW_TEAM_MODE` unset) — all patches are additive, gated on `team` parameter presence.

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer working on the OpenClaw monolith.

Task:
Patch src/agents/agent-command.ts to accept an optional TeamCtx parameter.

READ the file first to understand the existing function signature before making changes.

Requirements:
  - Find the main agent execution function (likely runAgent or executeAgent or similar)
  - Add optional parameter: team?: TeamCtx
  - Add optional parameter: onToken?: (token: string) => void

  - At the start of agent execution, when team is present:
    Read overlay files from local paths (already resolved by file-resolver-s3.ts):
      const soulContent   = fs.readFileSync(team.files.soulPath, 'utf-8')
      const agentsContent = fs.readFileSync(team.files.agentsPath, 'utf-8')
      const memoryContent = fs.readFileSync(team.files.memoryPath, 'utf-8')
      const userContent   = fs.readFileSync(team.files.userProfilePath, 'utf-8')
      const tasksContent  = fs.readFileSync(team.files.tasksPath, 'utf-8')
    Inject these into the agent's system prompt (before existing system prompt, or replace placeholders)

  - Session key prefix:
    When team present: sessionKey = 'u:' + team.userId + ':' + channel + ':' + threadId
    Ensure this prefix is used for any session/memory storage (vector DB, KV)

  - Token streaming:
    When onToken is provided, call it for each partial LLM token as they arrive
    Existing streaming behavior is unchanged when onToken is not provided

  - Backward compatibility:
    When team is undefined: all new code is skipped — existing behavior 100% preserved
    Gate with: if (team) { ... new logic ... }

  - Memory write-back (IMPORTANT):
    Do NOT write MEMORY.md from inside agent-command.ts when in team mode
    The job-processor.ts handles write-back after agent completion
    When team present: skip any existing local fs writes for MEMORY.md/USER.md/TASKS.md

Files involved:
  - src/agents/agent-command.ts (patch)
  - src/team/types.ts (or shared/types) for TeamCtx type

Constraints:
  - Minimal patch — do not refactor agent-command.ts beyond what is needed
  - All new code gated on team presence
  - No breaking changes to existing function signature (team is optional)
  - TypeScript strict mode

Output: Diff showing exactly what lines changed/added
```

### 🧪 Testing Instructions

```
1. Run existing OpenClaw test suite WITHOUT OPENCLAW_TEAM_MODE:
   pnpm test
   → ALL existing tests must pass (backward compat check)

2. Test with team mode (integration):
   - Set OPENCLAW_TEAM_MODE=1
   - Write a test SOUL.md to /tmp/agent-scratch/test-user/SOUL.md
   - Call runAgent({ text: 'hello', team: testTeamCtx, onToken: (t) => process.stdout.write(t) })
   - Verify tokens streamed to onToken callback
   - Verify SOUL.md content was used in agent system prompt

3. Test session key prefix:
   - With team context: session key should start with 'u:{userId}:'
   - Without team: existing session key behavior

4. Test memory write-back bypass:
   - Agent processes a message that would normally update MEMORY.md
   - With team mode: MEMORY.md local file NOT modified by agent-command.ts
     (write-back is handled by job-processor.ts)
```

### 📥 Example Input

```ts
// New signature (team optional)
await runAgent({
  text: 'Add lead Rahul wants 2BHK',
  channel: 'whatsapp',
  threadId: '+919876543210',
  team: {
    userId: 'amit-uuid',
    workspaceId: null,
    isAdmin: false,
    source: 'cookie',
    files: { soulPath: '/tmp/agent-scratch/amit-uuid/SOUL.md', ... }
  },
  onToken: (token) => redis.publish('agent:stream:...', token),
});
```

### 📤 Expected Output

```
// Tokens streamed to onToken callback during LLM generation
// Agent response uses content from SOUL.md, MEMORY.md etc.
// No local file writes to MEMORY.md/TASKS.md (job-processor handles that)
```

### ✅ Acceptance Criteria

- [ ] Existing test suite passes with team mode OFF (backward compat)
- [ ] Agent reads SOUL.md, AGENTS.md, MEMORY.md, USER.md, TASKS.md from team.files paths
- [ ] Session key prefixed with `u:{userId}:` in team mode
- [ ] `onToken` callback called for each LLM token
- [ ] Memory write-back skipped inside agent-command (handled externally)
- [ ] Patch is < 30 lines

---

## 🧾 AGENT-5: BullMQ Job Enqueue (Gateway → Agent Worker)

### 🎯 Description

Implement the BullMQ producer on the Gateway Pod that enqueues agent jobs when a webhook message arrives, a WebSocket message is received, or an HTTP chat API is called. Include HMAC signing of job payloads for tamper protection.

Source: `02-service-contracts/README.md` — "BullMQ Job Schemas", `10-security-model/README.md` — "Threat 3 — BullMQ Job Tampering".

### ⚙️ Implementation Details

**Files to create:**
- `services/gateway/src/queue-producer.ts`

**Queue name:** `agent-jobs`

**Job dedup:** `jobId: payload.webhookMessageId` (prevents duplicate processing if webhook re-delivered)

**HMAC signing:**
```ts
const sig = createHmac('sha256', process.env.OPENCLAW_QUEUE_SECRET!)
  .update(JSON.stringify(payload))
  .digest('hex');
await queue.add('agent-job', { ...payload, _sig: sig }, { jobId: payload.webhookMessageId });
```

**Job options:**
```ts
{
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 86400 },
  removeOnFail: { age: 604800 },
  jobId: webhookMessageId,  // for dedup
}
```

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Create services/gateway/src/queue-producer.ts

Requirements:

Import:
  - { Queue } from 'bullmq'
  - { createHmac } from 'node:crypto'
  - redis from shared/redis/client
  - { AgentJobPayload } from shared/types/team-ctx

Create singleton queue:
  const agentJobsQueue = new Queue('agent-jobs', { connection: redis })

Export async function enqueueAgentJob(payload: Omit<AgentJobPayload, '_sig'>): Promise<string>:

  1. Validate required fields: userId, sessionKey, channel, text, timestamp
     → If any missing: throw Error('Invalid job payload: missing required fields')

  2. Sign payload:
     const payloadStr = JSON.stringify(payload)
     const sig = createHmac('sha256', process.env.OPENCLAW_QUEUE_SECRET!).update(payloadStr).digest('hex')
     const signedPayload = { ...payload, _sig: sig }

  3. Determine jobId:
     const jobId = payload.webhookMessageId || undefined
     (undefined = auto-generated by BullMQ; webhookMessageId = dedup key)

  4. Enqueue:
     const job = await agentJobsQueue.add('agent-job', signedPayload, {
       jobId,
       attempts: 3,
       backoff: { type: 'exponential', delay: 2000 },
       removeOnComplete: { age: 86400 },
       removeOnFail: { age: 604800 },
     })
     
  5. Log: info { jobId: job.id, userId, channel, sessionKey } 'job enqueued'
  6. Return job.id

Export async function getQueueStats(): Promise<{ waiting: number, active: number, failed: number }>:
  - Return BullMQ queue metrics for admin DLQ view

Constraints:
  - OPENCLAW_QUEUE_SECRET must be set or throw at module load time
  - Use the SAME redis connection (not a duplicate) — Queue reuses the connection
  - webhookMessageId is the dedup key — same message enqueued twice = only one job
  - TypeScript strict mode

Output: Complete queue-producer.ts
```

### 🧪 Testing Instructions

```
1. Start Redis + worker
2. Call enqueueAgentJob with test payload
   → Job appears in BullMQ: bullmq:agent-jobs:wait set has the job
3. Test dedup:
   - Call enqueueAgentJob twice with same webhookMessageId
   - BullMQ should have only 1 job (second enqueue is ignored)
4. Test HMAC signature:
   - Enqueue a job
   - On the worker side, verify job._sig is correct
   - Tamper with job data → verify agent worker rejects it
5. Test missing OPENCLAW_QUEUE_SECRET:
   - Unset env var → module load throws error
6. Test queue stats:
   - Enqueue 5 jobs with no worker running
   - getQueueStats() → { waiting: 5, active: 0, failed: 0 }
```

### 📥 Example Input

```ts
const jobId = await enqueueAgentJob({
  userId: 'amit-uuid',
  workspaceId: null,
  isAdmin: false,
  source: 'cookie',
  channel: 'whatsapp',
  threadId: '+919876543210',
  sessionKey: 'u:amit-uuid:wa:+919876543210',
  text: 'Add lead Rahul wants 2BHK',
  webhookMessageId: 'wamid.abc123',
  timestamp: new Date().toISOString(),
});
```

### 📤 Expected Output

```ts
// jobId: 'wamid.abc123' (same as webhookMessageId)
// BullMQ job data includes _sig field
// Second enqueue with same webhookMessageId → same jobId returned (no duplicate)
```

### ✅ Acceptance Criteria

- [ ] Job enqueued to `agent-jobs` queue in Redis
- [ ] `_sig` HMAC field added to every job payload
- [ ] Duplicate `webhookMessageId` → only one job in queue (BullMQ jobId dedup)
- [ ] Job options: 3 attempts, exponential backoff, TTL for complete/fail
- [ ] Missing `OPENCLAW_QUEUE_SECRET` → throw at startup
- [ ] `getQueueStats()` returns correct counts for admin panel
