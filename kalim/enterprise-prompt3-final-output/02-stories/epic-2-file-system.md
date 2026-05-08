# EPIC 2 — User Overlay File System

---

## 🧾 FS-1: S3 Client Factory and Low-Level Helpers

### 🎯 Description

Build the S3 client factory and helper functions used by both the Gateway Pod (for attachment uploads) and the Agent Worker Pod (for all user file reads/writes). Must support both AWS S3 and self-hosted MinIO via the `S3_ENDPOINT` env override.

Source: `05-agent-runtime/README.md` — "Secure FS Adapter (S3-Backed)" and `06-data-model/README.md` — "S3 Access Policies".

### ⚙️ Implementation Details

**Files to create:**
- `services/shared/src/s3/client.ts`
- `services/shared/src/s3/helpers.ts`

**Configuration:**
```
OPENCLAW_S3_BUCKET          → bucket name
S3_ENDPOINT                 → MinIO endpoint (omit for AWS S3)
AWS_ACCESS_KEY_ID           → access key
AWS_SECRET_ACCESS_KEY       → secret key
AWS_REGION                  → region (default: us-east-1)
```

**S3Client factory:**
```ts
createS3Client(): S3Client
  → new S3Client({ region, credentials, endpoint: S3_ENDPOINT (if set), forcePathStyle: true (for MinIO) })
  → Singleton pattern
```

**Helper functions:**
```ts
getObject(key: string): Promise<string>          → GetObjectCommand → stream → utf-8 string
putObject(key: string, content: string, mime?: string): Promise<void>  → PutObjectCommand
headObject(key: string): Promise<boolean>        → HeadObjectCommand → returns true/false (not throws)
objectExists(key: string): Promise<boolean>      → same as headObject
copyObject(srcKey: string, dstKey: string): Promise<void>  → CopyObjectCommand
```

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Create services/shared/src/s3/client.ts and services/shared/src/s3/helpers.ts

For client.ts:
  - Import S3Client from '@aws-sdk/client-s3'
  - Export function createS3Client(): S3Client
    - region: process.env.AWS_REGION || 'us-east-1'
    - credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY }
    - If S3_ENDPOINT is set: endpoint: process.env.S3_ENDPOINT, forcePathStyle: true
      (forcePathStyle is required for MinIO compatibility)
  - Export singleton: export const s3 = createS3Client()
  - Export const BUCKET = process.env.OPENCLAW_S3_BUCKET || 'openclaw-workspace'

For helpers.ts:
  - Import { s3, BUCKET } from './client'
  - Import GetObjectCommand, PutObjectCommand, HeadObjectCommand, CopyObjectCommand from '@aws-sdk/client-s3'

  - Export async function getObject(key: string): Promise<string>
    - s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
    - Stream body to string: await response.Body.transformToString('utf-8')
    - Throws if object not found (let caller handle NoSuchKey)

  - Export async function putObject(key: string, content: string, contentType = 'text/plain'): Promise<void>
    - s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: content, ContentType: contentType }))

  - Export async function headObject(key: string): Promise<boolean>
    - try: s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })) → return true
    - catch NoSuchKey or 404: return false
    - rethrow other errors

  - Export async function copyObject(srcKey: string, dstKey: string): Promise<void>
    - s3.send(new CopyObjectCommand({ Bucket: BUCKET, CopySource: BUCKET + '/' + srcKey, Key: dstKey }))

Dependencies: @aws-sdk/client-s3

Constraints:
  - forcePathStyle MUST be true when S3_ENDPOINT is set (MinIO requires it)
  - getObject throws on missing key — callers use headObject/objectExists to check first
  - putObject handles both new and overwrite (S3 semantics)
  - TypeScript strict mode
  - No global state beyond singleton client

Output: Complete TypeScript files
```

### 🧪 Testing Instructions

```
1. Start MinIO: docker compose up minio
2. Create bucket 'openclaw-workspace' via MinIO console (localhost:9001) or mc CLI:
   mc alias set local http://localhost:9000 minioadmin minioadmin
   mc mb local/openclaw-workspace
3. Test putObject: await putObject('test/hello.txt', 'Hello World')
   → mc ls local/openclaw-workspace/test/ → hello.txt listed
4. Test getObject: await getObject('test/hello.txt') → 'Hello World'
5. Test headObject on existing: → true
6. Test headObject on non-existing: → false (no throw)
7. Test getObject on non-existing: → throws (NoSuchKey or similar)
8. Test copyObject: copy 'test/hello.txt' → 'test/hello-copy.txt'
   → getObject('test/hello-copy.txt') → 'Hello World'
9. Test with real AWS S3 (if available): remove S3_ENDPOINT, use real AWS creds
```

### 📥 Example Input

```ts
await putObject('users/user_abc/SOUL.md', '# Soul\nYou are a helpful assistant.');
const content = await getObject('users/user_abc/SOUL.md');
```

### 📤 Expected Output

```ts
// content: '# Soul\nYou are a helpful assistant.'
```

### ✅ Acceptance Criteria

- [ ] Works with MinIO (forcePathStyle=true, custom endpoint)
- [ ] Works with AWS S3 (no endpoint override)
- [ ] `getObject` returns UTF-8 string content
- [ ] `putObject` creates or overwrites objects
- [ ] `headObject` returns boolean without throwing on missing
- [ ] `copyObject` copies within the same bucket
- [ ] All functions throw on real errors (network, auth, etc.)

---

## 🧾 FS-2: Secure FS Adapter (S3-Backed secureRead / secureWrite)

### 🎯 Description

Implement the S3-backed `secureRead` and `secureWrite` functions that replace the simple plan's filesystem-path-based security. Instead of validating filesystem paths, validate S3 key prefixes. Users can only access `users/user_{userId}/` prefix; `base/` is read-only; path traversal (`..`, `//`) is blocked.

Source: `05-agent-runtime/README.md` — "Secure FS Adapter (S3-Backed)" — the exact code and `validateS3Key`/`validateS3WriteKey` logic is specified in the design.

### ⚙️ Implementation Details

**Files to create:**
- `services/agent-worker/src/secure-fs-s3.ts`

**Security rules (must ALL be enforced):**
1. Read: key must start with `users/user_{userId}/` OR `base/`
2. Write: key must start with `users/user_{userId}/` (writes to `base/` ALWAYS forbidden)
3. Path traversal: key must NOT contain `..` or `//`
4. Cross-user access: user A cannot access `users/user_B/` prefix

**Error class:** `SecureFsViolationError` extends Error with `userId`, `key`, `reason` fields.

**Append semantics for MEMORY.md:**
- S3 doesn't support native append
- `secureWrite(userId, key, content, { append: true })`: read existing → concatenate → write back
- Soft cap: trim oldest lines when MEMORY.md exceeds 8KB

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer working on security-critical code.

Task:
Implement services/agent-worker/src/secure-fs-s3.ts

Requirements:

Export class SecureFsViolationError extends Error:
  constructor(userId: string, key: string, reason: string)
  → super(`[SecureFS-S3] user=${userId} key=${key} reason=${reason}`)
  → this.name = 'SecureFsViolationError'
  → this.userId = userId; this.key = key; this.reason = reason

Export function validateS3Key(userId: string, key: string): string:
  - userPrefix = 'users/user_' + userId + '/'
  - basePrefix = 'base/'
  - If key does NOT start with either: throw SecureFsViolationError(userId, key, 'outside user and base prefix')
  - If key contains '..' : throw SecureFsViolationError(userId, key, 'path traversal detected')
  - If key contains '//' : throw SecureFsViolationError(userId, key, 'path traversal detected')
  - Return key

Export function validateS3WriteKey(userId: string, key: string): string:
  - Call validateS3Key(userId, key)
  - If key starts with 'base/': throw SecureFsViolationError(userId, key, 'writes to base/ forbidden')
  - Return key

Export async function secureRead(userId: string, key: string): Promise<string>:
  - validateS3Key(userId, key)
  - return await getObject(key)  [from shared/src/s3/helpers]

Export async function secureWrite(userId: string, key: string, content: string, options?: { append?: boolean, memoryCap?: number }): Promise<void>:
  - validateS3WriteKey(userId, key)
  - If options?.append:
    - existing = await getObject(key).catch(() => '')
    - combined = existing + content
    - If options?.memoryCap and combined.length > memoryCap (default 8192):
      - lines = combined.split('\n')
      - remove oldest lines from the start until length <= memoryCap
      - combined = remaining lines joined
    - content = combined
  - await putObject(key, content)

Constraints:
  - validateS3Key must be called BEFORE any S3 operation — never skip validation
  - SecureFsViolationError must ALWAYS be logged at ERROR level (regardless of log level setting)
  - ALL validation failures throw — callers do not get a default fallback
  - TypeScript strict mode
  - The functions must be synchronous for validation, async for S3 I/O

Output: Complete secure-fs-s3.ts with all exports
```

### 🧪 Testing Instructions

```
1. Unit tests in services/agent-worker/src/__tests__/secure-fs-s3.test.ts

Test validateS3Key:
  - validateS3Key('abc', 'users/user_abc/SOUL.md') → returns key (no throw)
  - validateS3Key('abc', 'base/SOUL.md') → returns key (no throw)
  - validateS3Key('abc', 'users/user_xyz/SOUL.md') → throws SecureFsViolationError
  - validateS3Key('abc', 'users/user_abc/../../../etc/passwd') → throws
  - validateS3Key('abc', 'users/user_abc//secret') → throws

Test validateS3WriteKey:
  - validateS3WriteKey('abc', 'users/user_abc/MEMORY.md') → returns key
  - validateS3WriteKey('abc', 'base/SOUL.md') → throws (writes to base/ forbidden)

Test secureRead (mock S3):
  - Mock getObject to return 'content'
  - secureRead('abc', 'users/user_abc/SOUL.md') → 'content'
  - secureRead('abc', 'users/user_xyz/SOUL.md') → throws SecureFsViolationError (not S3 error)

Test secureWrite with append:
  - Mock getObject to return 'line1\n'
  - secureWrite('abc', 'users/user_abc/MEMORY.md', 'line2\n', { append: true })
  - Mock putObject should have been called with 'line1\nline2\n'

Test memory cap:
  - Setup: existing = 8000 char string of lines
  - secureWrite with 500 char content and memoryCap: 8192
  - Resulting content should be <= 8192 chars
  - Oldest lines should be trimmed (not newest)
```

### 📥 Example Input

```ts
// Read SOUL.md for user 'amit-uuid'
const soul = await secureRead('amit-uuid', 'users/user_amit-uuid/SOUL.md');

// Append to MEMORY.md
await secureWrite('amit-uuid', 'users/user_amit-uuid/MEMORY.md', '\n- Created lead Rahul', { append: true, memoryCap: 8192 });

// Attempt cross-user access (should throw)
await secureRead('amit-uuid', 'users/user_priya-uuid/MEMORY.md');
```

### 📤 Expected Output

```
// secureRead: returns SOUL.md content
// secureWrite with append: content combined, cap enforced
// cross-user secureRead: throws SecureFsViolationError(user=amit-uuid, key=users/user_priya-uuid/MEMORY.md, reason=outside user and base prefix)
```

### ✅ Acceptance Criteria

- [ ] User A cannot read `users/user_B/` — throws `SecureFsViolationError`
- [ ] `base/` is readable by any user (agent reads shared skills/tools)
- [ ] `base/` is NOT writable by any user — throws on write attempt
- [ ] Path traversal (`..`, `//`) detected and blocked
- [ ] `secureWrite` with `append: true` does read-concatenate-write cycle
- [ ] Memory cap trims oldest lines when content exceeds limit
- [ ] `SecureFsViolationError` always logged at ERROR level

---

## 🧾 FS-3: User File Resolver (S3-backed resolveUserFiles)

### 🎯 Description

Implement the S3-backed `resolveUserFiles` function called at the start of every agent job. It checks if the user's overlay files exist in S3, seeds them from `base/` on first access, downloads them to the local scratch volume (`/tmp/agent-scratch/{userId}/`), and returns local paths for fast in-process reads during agent execution.

Source: `05-agent-runtime/README.md` — "Job Processing Lifecycle" steps 2 and 3.

### ⚙️ Implementation Details

**Files to create:**
- `services/agent-worker/src/file-resolver-s3.ts`

**Overlay files:** SOUL.md, AGENTS.md, MEMORY.md, USER.md, TASKS.md
**Seed source:** `base/SOUL.md`, `base/AGENTS.md` (from S3)
**Scratch dir:** `/tmp/agent-scratch/{userId}/` (local emptyDir volume)

**Flow:**
```
1. Create /tmp/agent-scratch/{userId}/ directory
2. For each file: [SOUL.md, AGENTS.md, MEMORY.md, USER.md, TASKS.md]
   a. Check S3: objectExists('users/user_{userId}/{file}')
   b. If NOT exists:
      - SOUL.md/AGENTS.md: copyObject('base/{file}', 'users/user_{userId}/{file}')
      - MEMORY.md/USER.md/TASKS.md: putObject('users/user_{userId}/{file}', '')
   c. Download to local: getObject(key) → write to /tmp/agent-scratch/{userId}/{file}
3. Return UserFiles object with local paths
```

**UserFiles type:**
```ts
interface UserFiles {
  soulPath: string;          // /tmp/agent-scratch/{userId}/SOUL.md
  agentsPath: string;        // /tmp/agent-scratch/{userId}/AGENTS.md
  memoryPath: string;        // /tmp/agent-scratch/{userId}/MEMORY.md
  userProfilePath: string;   // /tmp/agent-scratch/{userId}/USER.md
  tasksPath: string;         // /tmp/agent-scratch/{userId}/TASKS.md
  uploadsS3Prefix: string;   // s3://bucket/users/user_{userId}/uploads/
  conversationsS3Prefix: string;
  logsS3Prefix: string;
  tmpDir: string;            // /tmp/agent-scratch/{userId}/tmp/
}
```

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Implement services/agent-worker/src/file-resolver-s3.ts

Requirements:

Import:
  - { getObject, putObject, headObject, copyObject } from '../../../shared/src/s3/helpers'
  - { validateS3Key } from './secure-fs-s3'
  - fs/promises (mkdir, writeFile, rm)

Export interface UserFiles {
  soulPath: string; agentsPath: string; memoryPath: string;
  userProfilePath: string; tasksPath: string;
  uploadsS3Prefix: string; conversationsS3Prefix: string; logsS3Prefix: string;
  tmpDir: string;
}

Export async function resolveUserFiles(userId: string): Promise<UserFiles>:
  - const scratchDir = '/tmp/agent-scratch/' + userId
  - const tmpDir = scratchDir + '/tmp'

  - Step 1: Create scratch directories
    await fs.mkdir(scratchDir, { recursive: true })
    await fs.rm(tmpDir, { recursive: true, force: true })  // Clear tmp from previous job
    await fs.mkdir(tmpDir, { recursive: true })

  - Step 2: Resolve each file
    const overlayFiles = [
      { name: 'SOUL.md',   seedFrom: 'base/SOUL.md',   emptyOk: false },
      { name: 'AGENTS.md', seedFrom: 'base/AGENTS.md', emptyOk: false },
      { name: 'MEMORY.md', seedFrom: null,              emptyOk: true  },
      { name: 'USER.md',   seedFrom: null,              emptyOk: true  },
      { name: 'TASKS.md',  seedFrom: null,              emptyOk: true  },
    ]

    for each file:
      const s3Key = 'users/user_' + userId + '/' + file.name
      const exists = await headObject(s3Key)

      if (!exists):
        if file.seedFrom:
          const seedExists = await headObject(file.seedFrom)
          if seedExists:
            await copyObject(file.seedFrom, s3Key)
          else:
            await putObject(s3Key, '')  // base file missing — create empty
        else:
          await putObject(s3Key, '')   // MEMORY, USER, TASKS start empty

      const content = await getObject(s3Key)
      await fs.writeFile(scratchDir + '/' + file.name, content, 'utf-8')

  - Step 3: Return UserFiles with absolute local paths and S3 prefixes
    return {
      soulPath:           scratchDir + '/SOUL.md',
      agentsPath:         scratchDir + '/AGENTS.md',
      memoryPath:         scratchDir + '/MEMORY.md',
      userProfilePath:    scratchDir + '/USER.md',
      tasksPath:          scratchDir + '/TASKS.md',
      uploadsS3Prefix:    'users/user_' + userId + '/uploads/',
      conversationsS3Prefix: 'users/user_' + userId + '/conversations/',
      logsS3Prefix:       'users/user_' + userId + '/logs/',
      tmpDir,
    }

Constraints:
  - Must handle first-time user (no files in S3 yet) without errors
  - Must handle missing base/ files gracefully (create empty rather than crash)
  - /tmp/agent-scratch/{userId}/tmp/ MUST be cleared at start of each job
  - TypeScript strict mode
  - Log at info level: resolveUserFiles userId=... (new user? yes/no)

Output: Complete file-resolver-s3.ts
```

### 🧪 Testing Instructions

```
1. Clear MinIO: mc rm --recursive local/openclaw-workspace/users/
2. Create base files: mc cp SOUL.md local/openclaw-workspace/base/SOUL.md
3. Call resolveUserFiles('test-user-1')
   → S3: users/user_test-user-1/SOUL.md created (seeded from base)
   → Local: /tmp/agent-scratch/test-user-1/SOUL.md exists
   → Local: /tmp/agent-scratch/test-user-1/MEMORY.md exists (empty)
   → returns UserFiles with correct paths
4. Modify the local SOUL.md, then call resolveUserFiles('test-user-1') again
   → S3 file exists → NOT reseeded → local file written from S3 (fresh)
5. Test missing base/ SOUL.md:
   → mc rm local/openclaw-workspace/base/SOUL.md
   → resolveUserFiles('user-2') → creates empty SOUL.md (no crash)
6. Verify tmp/ is cleared between calls:
   → Write a file to /tmp/agent-scratch/test-user-1/tmp/garbage.txt
   → Call resolveUserFiles again
   → /tmp/agent-scratch/test-user-1/tmp/ is empty
```

### 📥 Example Input

```ts
const files = await resolveUserFiles('amit-uuid');
```

### 📤 Expected Output

```ts
{
  soulPath: '/tmp/agent-scratch/amit-uuid/SOUL.md',
  agentsPath: '/tmp/agent-scratch/amit-uuid/AGENTS.md',
  memoryPath: '/tmp/agent-scratch/amit-uuid/MEMORY.md',
  userProfilePath: '/tmp/agent-scratch/amit-uuid/USER.md',
  tasksPath: '/tmp/agent-scratch/amit-uuid/TASKS.md',
  uploadsS3Prefix: 'users/user_amit-uuid/uploads/',
  conversationsS3Prefix: 'users/user_amit-uuid/conversations/',
  logsS3Prefix: 'users/user_amit-uuid/logs/',
  tmpDir: '/tmp/agent-scratch/amit-uuid/tmp'
}
```

### ✅ Acceptance Criteria

- [ ] First-time user: SOUL.md seeded from `base/SOUL.md`, MEMORY/USER/TASKS created empty
- [ ] Existing user: files downloaded from S3 to local scratch (no seeding)
- [ ] Missing `base/` file: empty file created (no crash)
- [ ] `tmp/` directory cleared at start of each call
- [ ] Returns correct absolute local paths for all 5 overlay files
- [ ] Returns S3 prefix strings for uploads/conversations/logs

---

## 🧾 FS-4: Memory Write-Back (Upload Changed Files to S3 After Agent Job)

### 🎯 Description

After agent execution completes, upload any modified overlay files back to S3. Also upload the conversation transcript and execution log. This is the final step in the agent job lifecycle.

Source: `05-agent-runtime/README.md` — "Job Processing Lifecycle" step 5.

### ⚙️ Implementation Details

**Files to modify:**
- `services/agent-worker/src/job-processor.ts` (the write-back section)

**Files to upload:**
- `users/user_{userId}/MEMORY.md` — always upload (agent may have appended)
- `users/user_{userId}/USER.md` — upload if modified
- `users/user_{userId}/TASKS.md` — upload if modified
- `users/user_{userId}/conversations/{sessionKey}.jsonl` — transcript
- `users/user_{userId}/logs/{YYYY-MM-DD}.log` — execution log

**Detection of modification:** Compare SHA-256 of local file before/after agent execution. Only upload if hash differs.

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Implement the write-back section in services/agent-worker/src/job-processor.ts
(This is part of the larger job-processor — implement the writeBackFiles function)

Requirements:

Export async function writeBackFiles(userId: string, sessionKey: string, files: UserFiles, agentOutput: AgentOutput): Promise<void>:

  - For each overlay file [MEMORY.md, USER.md, TASKS.md]:
    a. Read local file content: fs.readFile(localPath, 'utf-8')
    b. Compute hash: sha256(content)
    c. Compare to hash taken BEFORE agent ran (passed in agentOutput.preHashes)
    d. If different: await secureWrite(userId, s3Key, content)
       Log: info 'wrote back {filename} for user {userId}'

  - Upload conversation transcript:
    const transcriptKey = 'users/user_' + userId + '/conversations/' + sessionKey + '.jsonl'
    await secureWrite(userId, transcriptKey, agentOutput.transcript)

  - Upload execution log:
    const date = new Date().toISOString().slice(0, 10)
    const logKey = 'users/user_' + userId + '/logs/' + date + '.log'
    const existing = await getObject(logKey).catch(() => '')
    await secureWrite(userId, logKey, existing + '\n' + agentOutput.log)

  - Clean up local scratch:
    await fs.rm('/tmp/agent-scratch/' + userId, { recursive: true, force: true })

Also add a helper function captureFileHashes(files: UserFiles): Promise<FileHashes>:
  - For MEMORY.md, USER.md, TASKS.md: sha256(await fs.readFile(path, 'utf-8'))
  - Return { memoryHash, userHash, tasksHash }

Constraints:
  - Only upload files that actually changed (compare hashes)
  - Transcript and logs are always uploaded regardless
  - Errors in upload should be logged but NOT fail the job (best-effort write-back)
  - secureWrite must be used — never call putObject directly
  - TypeScript strict mode

Output: The writeBackFiles and captureFileHashes functions
```

### 🧪 Testing Instructions

```
1. Set up: resolveUserFiles('test-user') to get files, capture initial hashes
2. Modify the local MEMORY.md: append '\n- test entry'
3. Call writeBackFiles with modified agentOutput
   → S3 MEMORY.md should be updated
   → S3 USER.md should NOT be re-uploaded (hash unchanged)
4. Upload conversation transcript:
   → S3 users/user_test/conversations/u:test:web:session1.jsonl exists
5. Upload execution log:
   → S3 users/user_test/logs/2026-05-02.log exists
6. Verify scratch cleanup:
   → /tmp/agent-scratch/test-user/ directory should NOT exist after writeBack
7. Test log append (call twice on same date):
   → Second call appends to existing log, not overwrites
```

### 📥 Example Input

```ts
await writeBackFiles('amit-uuid', 'u:amit-uuid:wa:+91...', files, {
  transcript: '[{"role":"user","content":"Add lead..."}]',
  log: '2026-05-02T10:30:00Z agent execution completed in 2340ms',
  preHashes: { memoryHash: 'abc123', userHash: 'def456', tasksHash: 'ghi789' }
});
```

### 📤 Expected Output

```
S3 updated:
  users/user_amit-uuid/MEMORY.md (if changed)
  users/user_amit-uuid/conversations/u:amit-uuid:wa:+91....jsonl (always)
  users/user_amit-uuid/logs/2026-05-02.log (always, appended)
/tmp/agent-scratch/amit-uuid/ → removed
```

### ✅ Acceptance Criteria

- [ ] Modified overlay files uploaded to S3 after agent execution
- [ ] Unmodified files NOT re-uploaded (hash comparison)
- [ ] Conversation transcript uploaded to correct S3 key
- [ ] Execution log appended to date-based log file
- [ ] Local scratch directory cleaned up after write-back
- [ ] Write-back errors logged but don't fail the job
- [ ] `secureWrite` used for all S3 writes (path validation enforced)

---

## 🧾 FS-5: Attachment Handling (Inbound Channel Media → S3)

### 🎯 Description

When a WhatsApp or Telegram message contains a document/image, the Gateway Pod downloads the file from the channel's API and uploads it to the user's S3 prefix. The S3 key is then passed as an attachment reference in the BullMQ job payload.

Source: `04-channel-routing/README.md` — "WhatsApp" step [4] and `02-service-contracts/README.md` — "Agent Worker → S3/MinIO API" attachment upload row.

### ⚙️ Implementation Details

**Called from:** `services/gateway/src/channel-router.ts`

**S3 key format:** `users/user_{userId}/uploads/{timestamp}_{fileId}.{ext}`

**Attachment flow:**
```
1. WhatsApp: Extract file_id from Meta webhook body
   → GET https://graph.facebook.com/v18.0/{fileId}?access_token=...
   → Receive download URL
   → Download file bytes
   → putObject(key, bytes, mimeType)

2. Telegram: Extract file_id from webhook body
   → GET https://api.telegram.org/bot{token}/getFile?file_id=...
   → Receive file_path
   → GET https://api.telegram.org/file/bot{token}/{file_path}
   → Download file bytes
   → putObject(key, bytes, mimeType)

3. Return AttachmentRef: { s3Key, mimeType, originalName }
```

**Security:** All attachment keys MUST pass `validateS3WriteKey(userId, key)` before upload.

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Create services/gateway/src/attachment-handler.ts

Requirements:

Export interface AttachmentRef { s3Key: string; mimeType: string; originalName?: string }

Export async function downloadWhatsAppAttachment(userId: string, mediaId: string, mimeType: string, accessToken: string): Promise<AttachmentRef>:
  - Step 1: GET https://graph.facebook.com/v18.0/{mediaId}?access_token={accessToken}
    → { url: string }
  - Step 2: GET {url} with Authorization: Bearer {accessToken}
    → binary response
  - Step 3: Compute s3Key:
    ext = mimeType.split('/')[1] || 'bin'
    s3Key = 'users/user_' + userId + '/uploads/' + Date.now() + '_' + mediaId + '.' + ext
  - Step 4: Validate: validateS3WriteKey(userId, s3Key)
  - Step 5: putObject(s3Key, buffer.toString('binary'), mimeType)
  - Return { s3Key, mimeType }

Export async function downloadTelegramAttachment(userId: string, fileId: string, mimeType: string, botToken: string): Promise<AttachmentRef>:
  - Step 1: GET https://api.telegram.org/bot{botToken}/getFile?file_id={fileId}
    → { result: { file_path: string } }
  - Step 2: GET https://api.telegram.org/file/bot{botToken}/{file_path}
    → binary response
  - Step 3: Compute s3Key: 'users/user_' + userId + '/uploads/' + Date.now() + '_' + fileId + '.bin'
  - Step 4: validateS3WriteKey(userId, s3Key)
  - Step 5: putObject(s3Key, buffer, mimeType)
  - Return { s3Key, mimeType }

Constraints:
  - Always call validateS3WriteKey BEFORE putObject
  - File size limit: reject files > 50MB (return error AttachmentRef with error field)
  - Timeout: 30 seconds for download
  - On failure: log error, return null — caller skips attachment (job enqueued without it)
  - TypeScript strict mode, Node 22 native fetch

Output: Complete attachment-handler.ts
```

### 🧪 Testing Instructions

```
1. Mock the Meta API and Telegram API responses
2. Test downloadWhatsAppAttachment:
   → Verify GET to graph.facebook.com to get URL
   → Verify GET to the download URL
   → Verify putObject called with correct S3 key
   → S3 key starts with 'users/user_{userId}/uploads/'
   → Key passes validateS3WriteKey
3. Test downloadTelegramAttachment: same verification
4. Test cross-user key injection (malicious mimeType):
   → Pass mimeType='../../etc/passwd'
   → S3 key extension should be sanitized
5. Test file too large (>50MB):
   → Returns null (no crash)
6. Integration test: real Telegram bot + real MinIO
   → Send a document to bot → check MinIO for uploaded file
```

### 📥 Example Input

```ts
// WhatsApp document message
const attachment = await downloadWhatsAppAttachment(
  'amit-uuid', 'wamid.abc123', 'application/pdf', 'meta_access_token'
);
```

### 📤 Expected Output

```ts
{ s3Key: 'users/user_amit-uuid/uploads/1714500000000_wamid.abc123.pdf', mimeType: 'application/pdf' }
```

### ✅ Acceptance Criteria

- [ ] Downloads attachment from Meta Cloud API (via two-step URL resolution)
- [ ] Downloads attachment from Telegram (via getFile API)
- [ ] S3 key always starts with `users/user_{userId}/uploads/`
- [ ] `validateS3WriteKey` called before upload
- [ ] Files > 50MB are rejected
- [ ] Failure returns null (job still enqueued without attachment)
- [ ] Extension derived from mimeType, not from user-supplied filename
