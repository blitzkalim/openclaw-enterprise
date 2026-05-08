# EPIC 8 — Deployment & Configuration

> Source: `09-deployment-model/deployment.md`. Single EC2 + Docker Compose. K8s explicitly out of scope for v1.

---

## STORY 8.1 — Update `package.json` with New Dependencies and Scripts

### 🎯 Description
Add `better-sqlite3`, `argon2` to dependencies. Add a `team:reset-password` script. Bump engine requirement if needed.

### ⚙️ Implementation Details

**File**: `package.json` (PATCH).

Adds:
```json
{
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "argon2": "^0.40.0"
  },
  "scripts": {
    "team:reset-password": "node ./dist/team/cli.js reset-password"
  }
}
```

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Update package.json for team mode dependencies.

REQUIREMENTS
1. Add to "dependencies":
   - "better-sqlite3": "^11.0.0"  (or the latest 11.x at install time)
   - "argon2": "^0.40.0"          (or its current latest)
2. If scripts.openclaw exists (the existing CLI), do NOT replace it. Instead, route the team subcommand through it:
   - Modify src/cli/* to recognize `team:reset-password <email>` and call into src/team/cli.ts.
3. Bump engines.node to >=22.5 if not already (we use Node fs.promises and crypto.hkdfSync — both available since 22.x).
4. After install, document running `pnpm rebuild better-sqlite3` in case prebuild fetch failed.

CONSTRAINTS
- Don't bump unrelated deps.
- Keep lockfile delta minimal.

OUTPUT
- The updated package.json.
- A short note for the README: "Native deps: better-sqlite3 ships prebuilds for linux-x64-glibc, darwin-x64, darwin-arm64, win32-x64. If your runtime is musl/Alpine: install build-essential and python3 in the Dockerfile."
```

### 🧪 Testing Instructions
1. `pnpm install` → succeeds, both deps resolved.
2. `node -e "require('better-sqlite3')"` → no error.
3. `pnpm team:reset-password user@x.com` → invokes Story 7.5's CLI.

### ✅ Acceptance Criteria
- [ ] Both deps installed.
- [ ] CLI script wired.
- [ ] Lockfile updated cleanly.

---

## STORY 8.2 — Dockerfile Updates for Native Deps

### 🎯 Description
Update the Dockerfile to install prerequisites for `better-sqlite3` (and any platform-specific build tools) and prebuild during image build.

### ⚙️ Implementation Details

**File**: `Dockerfile` (PATCH).

Add to the build stage:
```dockerfile
RUN apk add --no-cache python3 make g++ \
    && pnpm install --frozen-lockfile \
    && pnpm run build \
    && apk del python3 make g++
```

(Or `apt-get install -y build-essential python3` for Debian-based images.) After install + build, the prebuilt `better-sqlite3.node` is included in `node_modules`.

### 🤖 AI CODING PROMPT

```
You are a senior Docker/Node.js engineer.

TASK
Patch the OpenClaw Dockerfile to support better-sqlite3 builds.

REQUIREMENTS
1. Identify the base image (likely node:22-alpine or similar). Use the matching package manager.
2. In the build stage, install build prerequisites (Alpine: python3, make, g++; Debian: build-essential, python3) BEFORE pnpm install.
3. Run `pnpm install --frozen-lockfile`.
4. Remove the build prerequisites after install (Alpine: apk del; Debian: apt-get remove + autoremove) to keep image size small.
5. The runtime stage copies node_modules from the build stage; runtime image needs NO build tools.
6. Add a healthcheck:
   HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
   (assumes /healthz exists or the gateway responds on /).

CONSTRAINTS
- Multi-stage build (already standard in OpenClaw).
- Final image must not contain compilers.
- Don't change the base image major version.

OUTPUT
- The patched Dockerfile (full file or unified diff).
```

### 🧪 Testing Instructions
1. `docker build -t openclaw-team .` → succeeds.
2. `docker run --rm openclaw-team node -e "console.log(require('better-sqlite3'))"` → prints the binding object.
3. Image size delta vs. previous build < +50 MB.
4. Healthcheck passes once container is up.

### ✅ Acceptance Criteria
- [ ] Build succeeds on x86_64 and arm64.
- [ ] Final image free of build tools.
- [ ] better-sqlite3 loads at runtime.

---

## STORY 8.3 — `docker-compose.yml` and `Caddyfile`

### 🎯 Description
Ship the deployment artifacts that turn a fresh VM into a running team-mode OpenClaw with HTTPS.

### ⚙️ Implementation Details

**Files**:
- `docker-compose.yml` (NEW or UPDATE)
- `Caddyfile` (NEW)
- `.env.example` (NEW)

```yaml
# docker-compose.yml
version: '3.8'
services:
  caddy:
    image: caddy:2
    ports: ['80:80', '443:443']
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
    restart: unless-stopped
  openclaw:
    image: ghcr.io/openclaw/openclaw:latest
    environment:
      OPENCLAW_TEAM_MODE: '1'
      OPENCLAW_GATEWAY_TOKEN: ${OPENCLAW_GATEWAY_TOKEN}
      OPENCLAW_TEAM_ADMIN_EMAIL: ${OPENCLAW_TEAM_ADMIN_EMAIL}
      OPENCLAW_TEAM_ADMIN_PASSWORD: ${OPENCLAW_TEAM_ADMIN_PASSWORD}
      OPENCLAW_PUBLIC_BASE_URL: ${OPENCLAW_PUBLIC_BASE_URL}
      OPENCLAW_COOKIE_SECRET: ${OPENCLAW_COOKIE_SECRET}
    volumes:
      - openclaw-data:/root/.openclaw
    expose: ['8080']
    restart: unless-stopped
volumes:
  caddy-data:
  openclaw-data:
```

```
# Caddyfile
{$DOMAIN} {
  reverse_proxy openclaw:8080
  encode gzip
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
  }
}
```

```
# .env.example
DOMAIN=oc.example.com
OPENCLAW_GATEWAY_TOKEN=change-me-32-char-random
OPENCLAW_TEAM_ADMIN_EMAIL=admin@example.com
OPENCLAW_TEAM_ADMIN_PASSWORD=ChangeMe-At-Least-12-Chars
OPENCLAW_PUBLIC_BASE_URL=https://oc.example.com
OPENCLAW_COOKIE_SECRET=at-least-32-random-bytes-hex-encoded
```

### 🤖 AI CODING PROMPT

```
You are a senior DevOps engineer.

TASK
Create deployment files: docker-compose.yml, Caddyfile, .env.example.

REQUIREMENTS
1. docker-compose.yml at repo root. Two services (caddy, openclaw); two named volumes; restart policies.
2. Caddyfile uses {$DOMAIN} from env. Auto-TLS via Let's Encrypt (default Caddy behavior). Add HSTS, X-Content-Type-Options, Referrer-Policy headers.
3. .env.example documents every required env var with a one-line comment for each.
4. Add a small `make up` and `make logs` Makefile (or cross-platform pnpm scripts) for convenience.

CONSTRAINTS
- No exposed Postgres, Redis, or other ports.
- caddy-data volume persists certs across restarts.
- openclaw-data is the SOLE place app state lives — backups copy this volume.

OUTPUT
- The three files.
```

### 🧪 Testing Instructions
1. `cp .env.example .env`, fill in real values, `docker compose up -d`.
2. `docker compose logs openclaw` → bootstrap admin seeded log line.
3. Visit `https://${DOMAIN}/login` → 200 + Caddy-issued TLS cert.
4. POST `/auth/login` with admin creds → 200, cookie set.
5. `docker compose down && docker compose up -d` → state preserved (login still works).

### ✅ Acceptance Criteria
- [ ] One-command bring-up.
- [ ] Auto-TLS works without manual cert provisioning.
- [ ] State persists across restart.
- [ ] No service exposed beyond 80/443.

---

## STORY 8.4 — Backup Cron + Restore Documentation

### 🎯 Description
A small sample crontab and one-page docs explaining how to back up and restore the SQLite + workspace tree.

### ⚙️ Implementation Details

**File**: `docs/team-backup.md` (NEW, ~40 lines).

```bash
# /etc/cron.d/openclaw-backup
0 3 * * * root docker exec openclaw \
    sh -c 'cp -a /root/.openclaw/team.sqlite /root/.openclaw/backups/team-$(date +\%F).sqlite \
        && cp -a /root/.openclaw/workspace /root/.openclaw/backups/workspace-$(date +\%F)'
0 4 * * * root rsync -a /var/lib/docker/volumes/openclaw-data/_data/ /backups/openclaw/
```

Restore: stop container, replace volume from backup tarball, restart.

### 🤖 AI CODING PROMPT

```
You are a senior DevOps engineer.

TASK
Write docs/team-backup.md (one page) covering daily backup + tested restore.

REQUIREMENTS
1. Sections: What to back up; Local copy via cron; Off-host sync (rsync, S3 sync, restic); Restore procedure (stop → replace → start); Test-restore exercise.
2. Use better-sqlite3's online backup or just `cp` of the WAL+main file (both are safe to copy with the process running because of WAL atomicity).
3. Include the exact crontab from the design.
4. Document RTO/RPO assumptions: < 5 min RTO with manual restore, RPO = 24h with daily cron.

CONSTRAINTS
- No new tooling required for the basic flow.
- Operator-friendly — assume small-team ops, not full DevOps team.

OUTPUT
- docs/team-backup.md.
```

### 🧪 Testing Instructions
1. Run the backup cron once → backup files appear in `~/.openclaw/backups/`.
2. Stop container, wipe volume, replace from backup → start → log in works.
3. Verify channel mappings + claimed identities survived.

### ✅ Acceptance Criteria
- [ ] Documented one-page procedure.
- [ ] Verified end-to-end restore.

---

## STORY 8.5 — Env-Var Documentation in `README.md` Section

### 🎯 Description
Add a `Team Mode` section to OpenClaw's main README documenting every env var, the activation switch, the boot sequence, and the upgrade/rollback procedure.

### ⚙️ Implementation Details

**File**: `README.md` (PATCH — add a section).

Includes a copy-paste of the env-var table from `09-deployment-model/deployment.md` plus the rollback procedure from `16-backward-compatibility/migration-strategy.md`.

### 🤖 AI CODING PROMPT

```
You are a senior technical writer / engineer.

TASK
Add a "Team Mode (multi-user with WhatsApp/Telegram)" section to README.md.

REQUIREMENTS
1. One-paragraph intro explaining what team mode is.
2. "Activation" subsection: set OPENCLAW_TEAM_MODE=1 + the bootstrap admin envs.
3. "Environment Variables" table — every var, default, purpose.
4. "Quick start" subsection: docker compose up; visit /login; first run.
5. "Backward compatibility" subsection: with team mode unset, behavior is identical to pre-team OpenClaw; existing OPENCLAW_GATEWAY_TOKEN keeps working in both modes.
6. "Backup & Restore" link to docs/team-backup.md.
7. "When you outgrow this" subsection: pointer to /kalim/enterprise-plan/ for the full multi-tenant design.
8. ~150 lines. Plain markdown, no badges/CI noise.

CONSTRAINTS
- Don't restructure the existing README — append the section near the end.
- Don't repeat content extensively from /kalim/; link instead.

OUTPUT
- The section to insert (full markdown).
```

### 🧪 Testing Instructions
1. Read the section as a new operator → can stand up the system in < 15 minutes.
2. Every env var mentioned matches code reality (cross-check `src/team/`).
3. Rollback procedure tested: set `OPENCLAW_TEAM_MODE` empty → restart → behaves like single-user.

### ✅ Acceptance Criteria
- [ ] All env vars documented.
- [ ] Quick-start path verified.
- [ ] Rollback path verified.
