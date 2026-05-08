# EPIC 7 — Database & Infrastructure (Shared Library)

---

## 🧾 DB-1: Postgres Schema and Idempotent Migration Runner

### 🎯 Description

Create the complete Postgres schema (7 tables) and an idempotent migration runner that both the Gateway and the bootstrap Job use. Schema is a direct port from the simple plan's SQLite design to Postgres-native types. Migration must be safe to run multiple times (idempotent).

Source: `06-data-model/README.md` — "Postgres Schema" section — full DDL provided.

### ⚙️ Implementation Details

**Files to create:**
- `services/shared/src/db/schema.sql` — Postgres DDL
- `services/shared/src/db/migrate.ts` — Migration runner
- `services/shared/src/db/pool.ts` — Postgres connection pool factory

**Tables (7):**
1. `workspaces` — optional workspace grouping
2. `users` — user accounts with Argon2id passwords, status, admin flag
3. `user_sessions` — JWT sessions for admin audit (jti matches JWT jti claim)
4. `api_tokens` — API tokens, only SHA-256 hash stored
5. `channel_identities` — WhatsApp phone / Telegram chat → user mapping
6. `channel_claims` — Claim codes for Mode A identity linking
7. `workspace_secrets` — AES-256-GCM encrypted channel credentials

**Migration strategy:** Use Postgres `current_setting('openclaw.schema_version', true)` as version tracking. Each version block runs CREATE TABLE IF NOT EXISTS — fully idempotent.

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer with deep Postgres experience.

Task:
1. Create services/shared/src/db/schema.sql
2. Create services/shared/src/db/migrate.ts
3. Create services/shared/src/db/pool.ts

For schema.sql — write the complete DDL:

CREATE TABLE IF NOT EXISTS workspaces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT,
  is_admin      BOOLEAN NOT NULL DEFAULT false,
  workspace_id  UUID REFERENCES workspaces(id),
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'disabled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS user_sessions (
  id           UUID PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  user_agent   TEXT,
  ip_address   INET
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_exp  ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS api_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  hash         TEXT NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(hash);

CREATE TABLE IF NOT EXISTS channel_identities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id),
  channel      TEXT NOT NULL CHECK (channel IN ('whatsapp', 'telegram')),
  external_id  TEXT NOT NULL,
  display_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, external_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_identities_user   ON channel_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_identities_lookup ON channel_identities(channel, external_id);

CREATE TABLE IF NOT EXISTS channel_claims (
  code        TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS workspace_secrets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID REFERENCES workspaces(id),
  secret_type   TEXT NOT NULL,
  encrypted_val BYTEA NOT NULL,
  iv            BYTEA NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, secret_type)
);

For migrate.ts:
  import { Pool } from 'pg'
  import { readFileSync } from 'node:fs'
  import { join } from 'node:path'

  export async function migrate(pool: Pool): Promise<void>:
    // Check current schema version
    const result = await pool.query(
      "SELECT current_setting('openclaw.schema_version', true) as v"
    )
    const version = parseInt(result.rows[0]?.v || '0', 10)

    if (version < 1):
      const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8')
      await pool.query(schema)
      await pool.query("SELECT set_config('openclaw.schema_version', '1', false)")
      console.log('[migrate] Schema v1 applied')

    // Future versions:
    // if (version < 2): await pool.query(SCHEMA_V2)

For pool.ts:
  import { Pool } from 'pg'
  
  let _pool: Pool | null = null
  
  export function getPool(): Pool:
    if (!_pool):
      _pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
        max: parseInt(process.env.DATABASE_POOL_SIZE || '10'),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      })
      _pool.on('error', (err) => console.error('Postgres pool error:', err.message))
    return _pool

Constraints:
  - All CREATE TABLE use IF NOT EXISTS (idempotent)
  - All CREATE INDEX use IF NOT EXISTS (idempotent)
  - Migration can run on a populated database without data loss
  - pool.ts: singleton, configured entirely from env vars
  - TypeScript strict mode

Output: All 3 complete files
```

### 🧪 Testing Instructions

```
1. Start Postgres: docker compose up postgres
2. Run migrate() with empty database
   → All 7 tables created
   → schema_version = 1

3. Run migrate() again (idempotency check)
   → No errors (IF NOT EXISTS prevents duplicate CREATE)
   → schema_version still 1

4. Verify tables exist:
   psql $DATABASE_URL -c '\dt'
   → workspaces, users, user_sessions, api_tokens, channel_identities, channel_claims, workspace_secrets

5. Verify indexes:
   psql -c '\di' → 8 indexes listed

6. Verify constraints:
   INSERT INTO users (email, password_hash, status) VALUES ('a@b.com', 'hash', 'invalid_status')
   → constraint violation error (CHECK on status)

7. Test cascade delete:
   INSERT user, INSERT channel_identity for that user
   DELETE user → channel_identity row also deleted (ON DELETE CASCADE)
```

### 📥 Example Input

```ts
const pool = getPool();
await migrate(pool);
// Tables now exist in Postgres
```

### 📤 Expected Output

```
[migrate] Schema v1 applied
// psql: 7 tables, 8 indexes created
```

### ✅ Acceptance Criteria

- [ ] All 7 tables created with correct column types (UUID, BOOLEAN, TIMESTAMPTZ, INET, BYTEA)
- [ ] All 8 indexes created
- [ ] CHECK constraint on `users.status` (active/disabled)
- [ ] CHECK constraint on `channel_identities.channel` (whatsapp/telegram)
- [ ] `ON DELETE CASCADE` on all user-referenced foreign keys
- [ ] Migration is fully idempotent (safe to run multiple times)
- [ ] Pool factory reads from `DATABASE_URL` env var
- [ ] SSL controlled by `DATABASE_SSL` env var

---

## 🧾 DB-2: Parameterized Query Functions

### 🎯 Description

Build the shared query library used by both Gateway and Agent Worker Pods. All queries use parameterized statements (no string concatenation). Functions cover all database operations defined in the service contracts.

Source: `02-service-contracts/README.md` — "Gateway → Postgres Queries" table (10 query types).

### ⚙️ Implementation Details

**File to create:**
- `services/shared/src/db/queries.ts`

**Query functions needed:**
```ts
// Users
findUserByEmail(email: string): Promise<User | null>
findUserById(id: string): Promise<User | null>
createUser(data: CreateUserInput): Promise<User>
updateUser(id: string, data: Partial<User>): Promise<User>
disableUser(id: string): Promise<void>
getAllUsers(): Promise<User[]>

// Sessions
createSession(data: SessionInput): Promise<void>
deleteSession(id: string): Promise<void>
deleteAllUserSessions(userId: string): Promise<string[]>  // returns jtis
getActiveSessions(userId: string): Promise<Session[]>

// API Tokens
createApiToken(data: CreateTokenInput): Promise<ApiToken>
findApiTokenByHash(hash: string): Promise<ApiTokenUser | null>
listApiTokens(userId: string): Promise<ApiToken[]>
deleteApiToken(id: string, userId: string): Promise<string | null>  // returns hash

// Channel Identities
findChannelIdentity(channel: string, externalId: string): Promise<ChannelIdentity | null>
insertChannelIdentity(data: ChannelIdentityInput): Promise<void>
listChannelIdentities(userId: string): Promise<ChannelIdentity[]>

// Channel Claims
createChannelClaim(data: ClaimInput): Promise<void>
findChannelClaim(code: string): Promise<ChannelClaim | null>
consumeChannelClaim(code: string): Promise<void>

// Workspace Secrets
getAllWorkspaceSecrets(): Promise<WorkspaceSecret[]>
upsertWorkspaceSecret(data: WorkspaceSecretInput): Promise<void>
```

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Create services/shared/src/db/queries.ts

Requirements:
Import { getPool } from './pool'

All queries MUST use parameterized statements ($1, $2, etc.)
NEVER concatenate user input into SQL strings

Write these functions (complete implementation for each):

findUserByEmail(email: string): Promise<User | null>:
  const result = await getPool().query(
    'SELECT id, email, password_hash, name, is_admin, workspace_id, status, created_at, last_seen_at FROM users WHERE email = $1',
    [email]
  )
  return result.rows[0] ? mapUser(result.rows[0]) : null

findUserById(id: string): Promise<User | null>:
  Same but WHERE id = $1

createUser(data: CreateUserInput): Promise<User>:
  INSERT INTO users (email, password_hash, name, is_admin, workspace_id) VALUES ($1, $2, $3, $4, $5) RETURNING *

updateUser(id: string, data: UpdateUserInput): Promise<void>:
  Build dynamic SET clause (only update provided fields)
  Use parameterized values for all fields

disableUser(id: string): Promise<void>:
  UPDATE users SET status='disabled' WHERE id = $1

getAllUsers(): Promise<User[]>:
  SELECT ... FROM users ORDER BY created_at

createSession(data: SessionInput): Promise<void>:
  INSERT INTO user_sessions (id, user_id, expires_at, user_agent, ip_address) VALUES ($1,$2,$3,$4,$5)

deleteSession(id: string): Promise<void>:
  DELETE FROM user_sessions WHERE id = $1

deleteAllUserSessions(userId: string): Promise<string[]>:
  DELETE FROM user_sessions WHERE user_id = $1 RETURNING id
  Return array of deleted session IDs (jtis)

getActiveSessions(userId: string): Promise<Session[]>:
  SELECT ... FROM user_sessions WHERE user_id = $1 AND expires_at > now() ORDER BY created_at DESC

createApiToken: INSERT INTO api_tokens ...
findApiTokenByHash: SELECT ... JOIN users ON ... WHERE hash = $1 (return user info too)
listApiTokens: SELECT ... WHERE user_id = $1
deleteApiToken: DELETE WHERE id = $1 AND user_id = $2 RETURNING hash

findChannelIdentity: SELECT ... WHERE channel = $1 AND external_id = $2
insertChannelIdentity: INSERT INTO channel_identities ...
listChannelIdentities: SELECT ... WHERE user_id = $1

createChannelClaim: INSERT INTO channel_claims ...
findChannelClaim: SELECT ... WHERE code = $1
consumeChannelClaim: UPDATE channel_claims SET consumed_at = now() WHERE code = $1

getAllWorkspaceSecrets: SELECT ... FROM workspace_secrets
upsertWorkspaceSecret: INSERT ... ON CONFLICT (workspace_id, secret_type) DO UPDATE SET ...

Export all types: User, Session, ApiToken, ChannelIdentity, ChannelClaim, WorkspaceSecret
Include snake_case → camelCase mapping in row mappers (mapUser, mapSession, etc.)

Constraints:
  - ALL queries use $1, $2 parameterization — ZERO string concatenation with user data
  - Row mappers convert snake_case (Postgres) to camelCase (TypeScript)
  - Dates returned as Date objects (not strings)
  - TypeScript strict mode, all return types explicit

Output: Complete queries.ts (~120 lines)
```

### 🧪 Testing Instructions

```
1. Start Postgres, run migrate()
2. Test createUser + findUserByEmail round trip
3. Test createSession + getActiveSessions
4. Test deleteAllUserSessions → returns array of jtis
5. Test createApiToken + findApiTokenByHash
6. Test findChannelIdentity: not found → null; found → correct object
7. Test createChannelClaim + consumeChannelClaim
8. Test upsertWorkspaceSecret: insert then update (ON CONFLICT)
9. SQL injection test:
   findUserByEmail("' OR '1'='1") → should return null (not all users)
   (Parameterized queries prevent injection)
```

### 📥 Example Input

```ts
const user = await createUser({ email: 'amit@test.com', passwordHash: '$argon2id$...', name: 'Amit', isAdmin: true });
const found = await findUserByEmail('amit@test.com');
```

### 📤 Expected Output

```ts
// user: { id: 'uuid-here', email: 'amit@test.com', name: 'Amit', isAdmin: true, status: 'active', ... }
// found: same object
```

### ✅ Acceptance Criteria

- [ ] All 20+ query functions implemented with parameterized statements
- [ ] SQL injection impossible (no string concatenation with user input)
- [ ] snake_case → camelCase row mapping in all queries
- [ ] `findUserByEmail` returns null for missing users (not throws)
- [ ] `deleteAllUserSessions` returns array of session IDs (for Redis cleanup)
- [ ] `upsertWorkspaceSecret` uses ON CONFLICT ... DO UPDATE

---

## 🧾 DB-3: Bootstrap Job (First-Run Admin + Schema + S3 Seeds)

### 🎯 Description

Implement the Kubernetes bootstrap Job that runs once on first deploy. It runs schema migration, creates the admin user (from env vars), and uploads `base/SOUL.md` and `base/AGENTS.md` to S3 if they don't already exist.

Source: `07-kubernetes-deployment/README.md` — "First-Run Bootstrap" section.

### ⚙️ Implementation Details

**Files to create:**
- `services/gateway/src/bootstrap.ts` — bootstrap script entry point

**Bootstrap steps:**
1. Connect to Postgres, run `migrate(pool)`
2. If `users` table is empty AND `OPENCLAW_TEAM_ADMIN_EMAIL` is set:
   - `hashPassword(OPENCLAW_TEAM_ADMIN_PASSWORD)`
   - `createUser({ email, passwordHash, name: 'Admin', isAdmin: true })`
3. Upload `base/` files to S3 if they don't exist:
   - Check `objectExists('base/SOUL.md')` — if false, upload from local `./base/SOUL.md` file
   - Same for `base/AGENTS.md`
4. Exit 0 on success, exit 1 on failure

**Local `./base/` files:** These are bundled into the Docker image at build time. The operator places their custom SOUL.md and AGENTS.md in `base/` before building the image.

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Create services/gateway/src/bootstrap.ts — First-run bootstrap script.

Requirements:

Main function (IIFE, run immediately):
  async function main():
    // Step 1: Validate env
    const required = ['DATABASE_URL', 'OPENCLAW_S3_BUCKET']
    for (const key of required):
      if (!process.env[key]): throw new Error('Missing required env: ' + key)

    // Step 2: Run schema migration
    const pool = getPool()
    await migrate(pool)
    console.log('[bootstrap] Migration complete')

    // Step 3: Create admin user if needed
    if (process.env.OPENCLAW_TEAM_ADMIN_EMAIL && process.env.OPENCLAW_TEAM_ADMIN_PASSWORD):
      const count = await pool.query('SELECT COUNT(*) FROM users')
      if (parseInt(count.rows[0].count) === 0):
        const passwordHash = await hashPassword(process.env.OPENCLAW_TEAM_ADMIN_PASSWORD)
        await createUser({
          email: process.env.OPENCLAW_TEAM_ADMIN_EMAIL,
          passwordHash,
          name: 'Admin',
          isAdmin: true,
          workspaceId: null,
        })
        console.log('[bootstrap] Admin user created: ' + process.env.OPENCLAW_TEAM_ADMIN_EMAIL)
      else:
        console.log('[bootstrap] Users already exist, skipping admin creation')

    // Step 4: Seed S3 base files
    const baseFiles = ['SOUL.md', 'AGENTS.md']
    for (const file of baseFiles):
      const s3Key = 'base/' + file
      const exists = await headObject(s3Key)
      if (!exists):
        const localPath = join(process.cwd(), 'base', file)
        if (existsSync(localPath)):
          const content = readFileSync(localPath, 'utf-8')
          await putObject(s3Key, content)
          console.log('[bootstrap] Uploaded ' + s3Key)
        else:
          console.warn('[bootstrap] Local base/' + file + ' not found — skipping')

    console.log('[bootstrap] Done')
    await pool.end()
    process.exit(0)

  main().catch((err) => {
    console.error('[bootstrap] FATAL:', err.message)
    process.exit(1)
  })

Constraints:
  - Admin user only created if users table is EMPTY (prevents overwrite on re-run)
  - S3 seed only uploaded if NOT already exists (idempotent)
  - Script must exit 0 on success, 1 on any error
  - TypeScript strict mode

Output: Complete bootstrap.ts
```

### 🧪 Testing Instructions

```
1. Start Postgres + MinIO (docker compose up postgres minio)
2. Run bootstrap: node dist/services/gateway/src/bootstrap.js
   → Tables created
   → Admin user created
   → base/SOUL.md and base/AGENTS.md uploaded to S3

3. Run bootstrap again (idempotency):
   → No tables re-created (IF NOT EXISTS)
   → "Users already exist, skipping admin creation"
   → "S3 files already exist, skipping"
   → Exit 0

4. Test missing base files:
   Remove base/SOUL.md from local
   → Warning logged, no crash, exit 0

5. Test missing DATABASE_URL:
   Unset DATABASE_URL → exit 1 with error message

6. Test failed S3 connection:
   Wrong S3 endpoint → exit 1
```

### 📥 Example Input

```bash
OPENCLAW_TEAM_ADMIN_EMAIL=admin@agency.com \
OPENCLAW_TEAM_ADMIN_PASSWORD=SecurePassword123! \
DATABASE_URL=postgres://... \
OPENCLAW_S3_BUCKET=openclaw-workspace \
node dist/services/gateway/src/bootstrap.js
```

### 📤 Expected Output

```
[bootstrap] Migration complete
[bootstrap] Admin user created: admin@agency.com
[bootstrap] Uploaded base/SOUL.md
[bootstrap] Uploaded base/AGENTS.md
[bootstrap] Done
```

### ✅ Acceptance Criteria

- [ ] Schema migration runs and completes
- [ ] Admin user created only when `users` table is empty
- [ ] Re-running bootstrap doesn't duplicate admin user or crash
- [ ] `base/` files uploaded to S3 only if missing
- [ ] Script exits 0 on success, 1 on any failure
- [ ] Missing env vars fail fast with clear error message

---

## 🧾 DB-4: SQLite → Postgres Migration Script

### 🎯 Description

Implement the migration script that reads the simple plan's SQLite database (`team.sqlite`) and imports all data into Postgres. This enables operators to migrate from the simple plan to the final plan without data loss.

Source: `11-migration-and-roadmap/README.md` — "Step 2 — SQLite → Postgres Migration" section.

### ⚙️ Implementation Details

**File to create:**
- `scripts/migrate-sqlite-to-postgres.ts`

**Tables to migrate:** users, user_sessions, api_tokens, channel_identities, channel_claims (not workspace_secrets — those are re-entered by admin).

**Type transformations:**
- `INTEGER (0/1)` → `BOOLEAN` (is_admin, etc.)
- `TEXT (uuid)` → `UUID` (Postgres native)
- `TEXT (ISO date)` → `TIMESTAMPTZ`
- `TEXT (IP)` → `INET`

**CLI usage:**
```
node dist/scripts/migrate-sqlite-to-postgres.js \
  --sqlite ~/.openclaw/team.sqlite \
  --postgres postgres://openclaw:pass@pg-host:5432/openclaw
```

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Create scripts/migrate-sqlite-to-postgres.ts

Requirements:
  - Use 'better-sqlite3' for reading SQLite
  - Use 'pg' Pool for writing Postgres
  - Parse --sqlite and --postgres from process.argv

Main steps:

1. Open SQLite: const sqlite = new Database(sqlitePath)
2. Connect to Postgres: const pool = new Pool({ connectionString: pgUrl })
3. Run migrate(pool) to ensure schema exists

4. Migrate users table:
   const users = sqlite.prepare('SELECT * FROM users').all()
   for each user:
     await pool.query(
       'INSERT INTO users (id, email, password_hash, name, is_admin, workspace_id, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (email) DO NOTHING',
       [user.id, user.email, user.password_hash, user.name, Boolean(user.is_admin), user.workspace_id, user.status, new Date(user.created_at)]
     )
   console.log('Migrated users: ' + users.length)

5. Migrate user_sessions:
   Same pattern, transform TEXT dates → Date, TEXT ip → INET

6. Migrate api_tokens:
   Same pattern

7. Migrate channel_identities:
   Same pattern

8. Migrate channel_claims:
   Same pattern, filter out expired claims (expires_at < now())

9. Print row counts:
   SELECT COUNT(*) FROM each table in Postgres
   Print comparison with SQLite counts

10. Exit 0

Constraints:
  - ON CONFLICT DO NOTHING for all inserts (re-runnable / partial migration friendly)
  - Dates: use new Date() to convert ISO strings
  - Booleans: Boolean(0) = false, Boolean(1) = true
  - Log progress: 'Migrating users...' before each table
  - TypeScript strict mode

Output: Complete migration script
```

### 🧪 Testing Instructions

```
1. Create test SQLite with some data:
   sqlite3 test.sqlite < test-data.sql
   (Insert 3 users, 2 sessions, 4 tokens, 2 identities)

2. Run migration:
   node dist/scripts/migrate-sqlite-to-postgres.js --sqlite test.sqlite --postgres postgres://...

3. Verify row counts match:
   psql -c 'SELECT count(*) FROM users'  → 3
   psql -c 'SELECT count(*) FROM api_tokens' → 4

4. Run migration again (idempotency):
   → No duplicates (ON CONFLICT DO NOTHING)
   → Row counts unchanged

5. Test is_admin conversion:
   SQLite user.is_admin = 1 → Postgres is_admin = true
   SQLite user.is_admin = 0 → Postgres is_admin = false

6. Test date conversion:
   SQLite created_at = '2026-01-15T10:30:00.000Z' → Postgres TIMESTAMPTZ
   → SELECT created_at FROM users → 2026-01-15 10:30:00+00
```

### 📥 Example Input

```bash
node scripts/migrate-sqlite-to-postgres.js \
  --sqlite ~/.openclaw/team.sqlite \
  --postgres postgres://openclaw:openclaw@localhost:5432/openclaw
```

### 📤 Expected Output

```
Migrating users...      → 3 rows
Migrating sessions...   → 2 rows
Migrating api_tokens... → 4 rows
Migrating identities... → 2 rows
Migrating claims...     → 0 rows (all expired)

Verification:
  users:             3 / 3 ✓
  user_sessions:     2 / 2 ✓
  api_tokens:        4 / 4 ✓
  channel_identities: 2 / 2 ✓

Migration complete. Exit 0.
```

### ✅ Acceptance Criteria

- [ ] All 5 tables migrated from SQLite to Postgres
- [ ] Type transformations: INTEGER→BOOLEAN, TEXT→TIMESTAMPTZ, TEXT→INET, TEXT→UUID
- [ ] ON CONFLICT DO NOTHING makes script re-runnable
- [ ] Expired claims filtered (not migrated)
- [ ] Row count verification printed at end
- [ ] Exit 0 on success, exit 1 on any error
