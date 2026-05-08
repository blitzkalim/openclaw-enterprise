# EPIC 8 — Deployment & Config

---

## 🧾 DEPLOY-1: Docker Compose for Local Development

### 🎯 Description

Create the `docker-compose.yml` that spins up all services locally with the exact same topology as production: Gateway Pod, Agent Worker Pod, Postgres, Redis, and MinIO. This allows developers to test the full distributed system on a single machine.

Source: `07-kubernetes-deployment/README.md` — "Local Development with Docker Compose" section (complete YAML provided).

### ⚙️ Implementation Details

**Files to create:**
- `docker-compose.yml`
- `docker-compose.override.yml` (dev overrides: volume mounts for hot reload)
- `.env.example` (template with all required env vars)

**Services:**
- `gateway` — image `openclaw-gateway:local`, ports 8080/8081
- `agent-worker` — image `openclaw-agent-worker:local`
- `postgres` — `postgres:16-alpine`, port 5432
- `redis` — `redis:7-alpine`, port 6379
- `minio` — `minio/minio:latest`, ports 9000/9001

**Startup order:** `postgres`, `redis`, `minio` must be healthy before `gateway` and `agent-worker` start. Use `depends_on` with `condition: service_healthy`.

**Health checks for dependencies:**
```yaml
postgres:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U openclaw"]
    interval: 5s
    timeout: 5s
    retries: 5

redis:
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 5s
    timeout: 5s
    retries: 5

minio:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
    interval: 5s
    timeout: 5s
    retries: 5
```

### 🤖 AI CODING PROMPT

```text
You are a senior DevOps/Node.js engineer.

Task:
Create docker-compose.yml, docker-compose.override.yml, and .env.example for the OpenClaw enterprise system.

docker-compose.yml:
version: '3.8'

services:
  gateway:
    image: ghcr.io/openclaw/openclaw-gateway:latest
    build:
      context: .
      dockerfile: services/gateway/Dockerfile
    ports:
      - '8080:8080'
      - '8081:8081'
    environment:
      OPENCLAW_TEAM_MODE: '1'
      DATABASE_URL: postgres://openclaw:openclaw@postgres:5432/openclaw
      REDIS_URL: redis://redis:6379
      OPENCLAW_S3_BUCKET: openclaw-workspace
      S3_ENDPOINT: http://minio:9000
      AWS_ACCESS_KEY_ID: minioadmin
      AWS_SECRET_ACCESS_KEY: minioadmin
      AWS_REGION: us-east-1
      OPENCLAW_PUBLIC_BASE_URL: http://localhost:8080
    env_file:
      - .env.local  (for secrets: JWT keys, gateway token, etc.)
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
      minio: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/healthz"]
      interval: 10s
      timeout: 5s
      retries: 3

  agent-worker:
    image: ghcr.io/openclaw/openclaw-agent-worker:latest
    build:
      context: .
      dockerfile: services/agent-worker/Dockerfile
    environment:
      OPENCLAW_TEAM_MODE: '1'
      DATABASE_URL: postgres://openclaw:openclaw@postgres:5432/openclaw
      REDIS_URL: redis://redis:6379
      OPENCLAW_S3_BUCKET: openclaw-workspace
      S3_ENDPOINT: http://minio:9000
      AWS_ACCESS_KEY_ID: minioadmin
      AWS_SECRET_ACCESS_KEY: minioadmin
    env_file:
      - .env.local  (for LLM API keys, JWT public key, queue secret)
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
      minio: { condition: service_healthy }

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: openclaw
      POSTGRES_PASSWORD: openclaw
      POSTGRES_DB: openclaw
    volumes:
      - pg-data:/var/lib/postgresql/data
    ports:
      - '5432:5432'
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U openclaw"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    command: server /data --console-address ':9001'
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - '9000:9000'
      - '9001:9001'
    volumes:
      - minio-data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 5s
      retries: 5

  bootstrap:
    image: ghcr.io/openclaw/openclaw-gateway:latest
    command: node dist/services/gateway/src/bootstrap.js
    environment:
      DATABASE_URL: postgres://openclaw:openclaw@postgres:5432/openclaw
      OPENCLAW_S3_BUCKET: openclaw-workspace
      S3_ENDPOINT: http://minio:9000
      AWS_ACCESS_KEY_ID: minioadmin
      AWS_SECRET_ACCESS_KEY: minioadmin
    env_file:
      - .env.local
    depends_on:
      postgres: { condition: service_healthy }
      minio: { condition: service_healthy }
    restart: 'no'

volumes:
  pg-data:
  redis-data:
  minio-data:

For .env.example:
  # Copy to .env.local and fill in values
  OPENCLAW_GATEWAY_TOKEN=changeme
  OPENCLAW_JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
  OPENCLAW_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
  OPENCLAW_COOKIE_SECRET=changeme32chars
  OPENCLAW_QUEUE_SECRET=changeme32chars
  OPENCLAW_SECRETS_KEY=base64encodedkey
  OPENCLAW_TEAM_ADMIN_EMAIL=admin@example.com
  OPENCLAW_TEAM_ADMIN_PASSWORD=ChangeThisPassword!
  OPENAI_API_KEY=sk-...
  TELEGRAM_BOT_TOKEN=
  ANTHROPIC_API_KEY=

Constraints:
  - All services depend on infra health checks (not just 'started')
  - Bootstrap service has restart: 'no' (runs once)
  - Secrets never hardcoded in docker-compose.yml — only in .env.local (git-ignored)
  - .env.example committed to git, .env.local in .gitignore

Output: All 3 files complete
```

### 🧪 Testing Instructions

```
1. Copy .env.example → .env.local, fill in secrets
   Generate JWT keys: openssl genrsa -out /tmp/jwt.pem 2048 && openssl rsa -in /tmp/jwt.pem -pubout

2. docker compose up -d
   → All 5 services start (postgres, redis, minio, gateway, agent-worker)
   → bootstrap runs once then exits

3. Verify health:
   curl http://localhost:8080/healthz → 200 { "status": "ok" }

4. Verify gateway login works:
   curl -X POST http://localhost:8080/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"admin@example.com","password":"ChangeThisPassword!"}'
   → 200 with JWT cookie

5. Verify MinIO console: http://localhost:9001
   → base/SOUL.md and base/AGENTS.md uploaded

6. Verify Postgres schema:
   psql postgres://openclaw:openclaw@localhost:5432/openclaw -c '\dt'
   → 7 tables listed

7. docker compose down → all containers stopped
   docker compose up -d → data persists (volumes)
```

### ✅ Acceptance Criteria

- [ ] `docker compose up` starts all services in correct order (health checks)
- [ ] Gateway reachable at `http://localhost:8080`
- [ ] MinIO console reachable at `http://localhost:9001`
- [ ] Bootstrap Job runs once and creates admin user + S3 seeds
- [ ] Data persists across `down` + `up` (named volumes)
- [ ] `.env.example` contains all required variables with instructions
- [ ] `.env.local` is git-ignored (not committed)

---

## 🧾 DEPLOY-2: Dockerfiles for Gateway and Agent Worker

### 🎯 Description

Create multi-stage Dockerfiles for the Gateway Pod and Agent Worker Pod. The Agent Worker image must include the full OpenClaw runtime (agents, plugins, extensions, skills). Both images use `node:22-alpine` base for minimal attack surface.

Source: `08-code-change-plan/README.md` — "Docker Images (Build Matrix)" and "Agent Worker Image — Special Consideration".

### ⚙️ Implementation Details

**Files to create:**
- `services/gateway/Dockerfile`
- `services/agent-worker/Dockerfile`

**Gateway Dockerfile (2-stage):**
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
COPY services/gateway/package.json services/gateway/
COPY services/shared/package.json services/shared/
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build:gateway  # Builds gateway + shared

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY base/ ./base/  # Seed files bundled into image
EXPOSE 8080 8081
ENV NODE_ENV=production
USER node
CMD ["node", "dist/services/gateway/src/index.js"]
```

**Agent Worker Dockerfile — CRITICAL:** Must include full OpenClaw runtime:
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY . .  # Full monolith root
RUN npm install -g pnpm && pnpm install --frozen-lockfile
RUN pnpm build  # Full build (monolith + services)

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/extensions ./extensions  # All 100+ extensions
COPY --from=builder /app/skills ./skills
COPY --from=builder /app/base ./base
ENV OPENCLAW_TEAM_MODE=1 NODE_ENV=production
USER node
CMD ["node", "dist/services/agent-worker/src/index.js"]
```

### 🤖 AI CODING PROMPT

```text
You are a senior DevOps/Node.js engineer with Docker expertise.

Task:
Create services/gateway/Dockerfile and services/agent-worker/Dockerfile

For services/gateway/Dockerfile:
  - Multi-stage: builder (installs deps, builds) + runtime (minimal)
  - Use node:22-alpine for both stages
  - Builder:
    - COPY package files first (layer caching for deps)
    - pnpm install --frozen-lockfile
    - COPY source files
    - RUN pnpm build (or tsc)
  - Runtime:
    - COPY only dist/ and node_modules/ from builder
    - COPY base/ directory (for bootstrap script)
    - COPY services/gateway/src/web/ (HTML templates)
    - Non-root user: USER node
    - EXPOSE 8080 8081
    - HEALTHCHECK: curl http://localhost:8080/healthz
    - CMD: node dist/services/gateway/src/index.js

For services/agent-worker/Dockerfile:
  - Must copy the FULL OpenClaw monolith (not just services/agent-worker/)
    because agent-worker imports from src/agents/, src/plugins/, extensions/, skills/
  - Multi-stage: builder + runtime
  - Builder: full monolith copy, full pnpm install, full build
  - Runtime: dist/, node_modules/, extensions/, skills/, base/
  - Non-root user: USER node
  - Volume mounts declared (not in Dockerfile, in pod spec):
    /tmp/agent-scratch (emptyDir)
    /data/lancedb (PVC)
  - CMD: node dist/services/agent-worker/src/index.js
  - No EXPOSE (queue consumer, no inbound HTTP on production)
    But expose a healthcheck port: 9090 for BullMQ health endpoint

Constraints:
  - Never run as root in production containers (USER node)
  - .dockerignore must exist to exclude: .git, node_modules (re-installed in builder), .env*, *.log
  - Layer ordering: package files → install → source files (maximize cache hits)
  - Image size: minimize with alpine base and multi-stage

Also create .dockerignore:
  .git
  .env*
  *.log
  node_modules
  coverage/
  .nyc_output
  dist/
  kalim/

Output: Both Dockerfiles + .dockerignore
```

### 🧪 Testing Instructions

```
1. Build gateway image:
   docker build -f services/gateway/Dockerfile -t openclaw-gateway:test .
   → Build succeeds, no errors

2. Build agent-worker image:
   docker build -f services/agent-worker/Dockerfile -t openclaw-agent-worker:test .
   → Build succeeds

3. Check image sizes:
   docker images | grep openclaw
   → gateway: < 500 MB (alpine + node)
   → agent-worker: < 1 GB (includes extensions)

4. Verify non-root user:
   docker run --rm openclaw-gateway:test whoami → 'node'

5. Run gateway image locally:
   docker run --env-file .env.local -p 8080:8080 openclaw-gateway:test
   → GET /healthz → 200

6. Security scan (optional):
   docker scout cves openclaw-gateway:test → review critical CVEs
```

### ✅ Acceptance Criteria

- [ ] Gateway Dockerfile builds successfully with multi-stage
- [ ] Agent Worker Dockerfile includes full OpenClaw runtime (extensions/, skills/)
- [ ] Both containers run as non-root user (`node`)
- [ ] `.dockerignore` excludes `.env*`, `.git`, `node_modules`, `dist/`
- [ ] Layer ordering optimized for cache hits (package files before source)
- [ ] Gateway image exposes 8080/8081 with health check
- [ ] Agent Worker image has no EXPOSE (consumer only)

---

## 🧾 DEPLOY-3: Helm Chart (Gateway + Agent Worker + Infra + HPA)

### 🎯 Description

Create the complete Helm chart for production Kubernetes deployment. Includes Deployments, Services, HPAs, PVCs, Secrets, ConfigMaps, NetworkPolicies, and a bootstrap Job. Supports `values-dev.yaml` (single replicas, MinIO) and `values-prod.yaml` (managed RDS/Elasticache/S3, multi-replicas).

Source: `07-kubernetes-deployment/README.md` — full Helm chart structure and all YAML specs provided.

### ⚙️ Implementation Details

**Files to create (complete Helm chart):**
```
charts/openclaw/
  Chart.yaml
  values.yaml          (defaults, see design doc §07)
  values-dev.yaml      (single replicas, MinIO, no managed services)
  values-prod.yaml     (managed RDS/Elasticache/S3, HPA enabled)
  templates/
    _helpers.tpl
    namespace.yaml
    secrets.yaml        (K8s Secret from values.secrets.*)
    configmap.yaml
    ingress.yaml
    gateway-deployment.yaml
    gateway-service.yaml
    gateway-hpa.yaml
    agent-worker-deployment.yaml
    agent-worker-hpa.yaml
    infra-statefulset.yaml
    bootstrap-job.yaml
    pvc-lancedb.yaml
    networkpolicy.yaml
```

**Key Helm values structure:**
```yaml
gateway.hpa.enabled, gateway.hpa.minReplicas, gateway.hpa.maxReplicas
agentWorker.hpa.enabled, agentWorker.hpa.metricName (BullMQ queue depth)
infra.managed (true = skip StatefulSet, use external DSNs)
storage.type (minio | s3 | pvc)
networkPolicies.enabled
```

### 🤖 AI CODING PROMPT

```text
You are a Kubernetes/Helm expert.

Task:
Create the complete Helm chart under charts/openclaw/

Write each template file completely. Key requirements:

Chart.yaml:
  name: openclaw
  version: 1.0.0
  appVersion: "1.0.0"
  description: "OpenClaw Enterprise — multi-user agent platform"

_helpers.tpl:
  Define: openclaw.fullname, openclaw.labels, openclaw.selectorLabels

gateway-deployment.yaml:
  - Deployment with configurable replicas
  - Env vars from ConfigMap + Secret refs
  - Liveness: GET /healthz
  - Readiness: GET /readyz
  - Resources from values.gateway.resources
  - Image: values.gateway.image:values.gateway.tag

gateway-hpa.yaml:
  - HorizontalPodAutoscaler
  - targetCPUUtilization from values
  - {{ if .Values.gateway.hpa.enabled }}

agent-worker-deployment.yaml:
  - Deployment for agent-worker
  - Volumes: emptyDir for /tmp/agent-scratch, PVC for /data/lancedb
  - Env: OPENCLAW_TEAM_MODE=1, Redis, DB, S3 from secrets
  - No ports exposed (consumer only)
  - Readiness probe: GET http://localhost:9090/health

agent-worker-hpa.yaml:
  - HPA with external metric: bullmq_queue_depth
  - targetAverageValue: 5
  - {{ if .Values.agentWorker.hpa.enabled }}

infra-statefulset.yaml:
  - {{ if not .Values.infra.managed }}
  - StatefulSet with 2 containers: postgres:16 and redis:7
  - PVCs: openclaw-pg-data, openclaw-redis-data
  - {{ end }}

bootstrap-job.yaml:
  - Kubernetes Job
  - helm.sh/hook: post-install, post-upgrade
  - helm.sh/hook-delete-policy: hook-succeeded
  - restartPolicy: OnFailure
  - Command: node dist/services/gateway/src/bootstrap.js

secrets.yaml:
  - K8s Secret with all secrets from values.secrets.*
  - Base64 encoded via {{ b64enc }}
  - {{ if .Values.secrets.gatewayToken }} include it, etc.

pvc-lancedb.yaml:
  - PVC for LanceDB vector storage
  - accessModes: [ReadWriteMany]
  - storageClassName from values.lancedb.pvc.storageClass
  - storage: values.lancedb.pvc.size

networkpolicy.yaml:
  - All 3 NetworkPolicies (gateway, agent-worker, infra)
  - {{ if .Values.networkPolicies.enabled }}

values-dev.yaml overrides:
  gateway:
    replicas: 1
    hpa:
      enabled: false
  agentWorker:
    replicas: 1
    hpa:
      enabled: false
  infra:
    managed: false
  storage:
    type: minio
  networkPolicies:
    enabled: false

values-prod.yaml overrides:
  infra:
    managed: true
  storage:
    type: s3
  networkPolicies:
    enabled: true

Output: Complete Helm chart (all files)
```

### 🧪 Testing Instructions

```
1. Lint Helm chart:
   helm lint charts/openclaw/
   → No errors

2. Template rendering (dry run, dev):
   helm template openclaw charts/openclaw/ -f charts/openclaw/values-dev.yaml | kubectl apply --dry-run=client -f -
   → No errors

3. Deploy to local kind cluster:
   kind create cluster
   helm install openclaw charts/openclaw/ -f charts/openclaw/values-dev.yaml \
     --set secrets.jwtPrivateKey="$(cat jwt-private.pem | base64 -w0)" \
     --set secrets.adminEmail=admin@test.com \
     --set secrets.adminPassword=Test123!
   → All Pods reach Running state

4. Verify bootstrap Job completed:
   kubectl logs job/openclaw-bootstrap -n openclaw
   → [bootstrap] Done

5. Verify HPA:
   kubectl get hpa -n openclaw (dev: no HPA created)
   -f values-prod.yaml: HPAs listed

6. Test upgrade:
   helm upgrade openclaw charts/openclaw/ -f values-dev.yaml
   → Bootstrap job re-runs (idempotent), no data loss
```

### ✅ Acceptance Criteria

- [ ] `helm lint` passes with no errors
- [ ] `helm template` renders valid Kubernetes YAML
- [ ] Gateway Deployment includes liveness/readiness probes
- [ ] Agent Worker Deployment has `emptyDir` + LanceDB PVC mounts
- [ ] HPA for Gateway (CPU) and Agent Worker (BullMQ queue depth)
- [ ] Bootstrap Job runs on `post-install` and `post-upgrade` hooks
- [ ] `infra.managed: true` disables the in-cluster StatefulSet
- [ ] NetworkPolicies gated on `networkPolicies.enabled`
- [ ] `values-dev.yaml` sets single replicas, no HPA, no NetworkPolicies

---

## 🧾 DEPLOY-4: Health Checks (/healthz and /readyz)

### 🎯 Description

Implement the Gateway Pod's health check endpoints and the Agent Worker's BullMQ health check. These are used by Kubernetes liveness and readiness probes, and by the Docker Compose health check configuration.

Source: `07-kubernetes-deployment/README.md` — "Health Checks" table.

### ⚙️ Implementation Details

**Files to create:**
- `services/gateway/src/health.ts`
- `services/agent-worker/src/health.ts`

**Gateway endpoints:**
```
GET /healthz  → 200 { "status": "ok" }  (liveness — just "am I alive?")
GET /readyz   → 200 { "status": "ready" } if Postgres + Redis are reachable
              → 503 { "status": "not ready", "checks": { postgres: false } } if not
```

**Agent Worker (internal HTTP server on port 9090):**
```
GET /health   → 200 { "status": "ok", "queue": "running" }
              → 503 { "status": "degraded", "queue": "paused" } if worker paused/error
Also: S3 headBucket check
```

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Create services/gateway/src/health.ts and services/agent-worker/src/health.ts

For gateway health.ts:
  Export function registerHealthRoutes(app: Express): void:

    app.get('/healthz', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() })
    })

    app.get('/readyz', async (req, res) => {
      const checks: Record<string, boolean> = {}
      
      // Postgres check
      try:
        await getPool().query('SELECT 1')
        checks.postgres = true
      catch:
        checks.postgres = false

      // Redis check
      try:
        await redis.ping()
        checks.redis = true
      catch:
        checks.redis = false

      const allReady = Object.values(checks).every(Boolean)
      res.status(allReady ? 200 : 503).json({
        status: allReady ? 'ready' : 'not ready',
        checks,
        timestamp: new Date().toISOString(),
      })
    })

For agent-worker health.ts:
  Create a small HTTP server on port 9090 (separate from BullMQ worker):
  
  Export function startHealthServer(worker: Worker): http.Server:
    const server = http.createServer(async (req, res) => {
      if (req.url === '/health'):
        const checks = {
          queue: worker.isRunning() ? 'running' : 'not running',
          s3: false,
        }
        
        // S3 check
        try:
          await headObject('base/')  // headObject returns false for missing, true for exists
          checks.s3 = true
        catch:
          checks.s3 = false

        const healthy = worker.isRunning()
        res.writeHead(healthy ? 200 : 503)
        res.end(JSON.stringify({ status: healthy ? 'ok' : 'degraded', checks }))
      else:
        res.writeHead(404)
        res.end('Not found')
    })

    server.listen(9090, () => console.log('Health server on :9090'))
    return server

Register in agent-worker/src/index.ts:
  const healthServer = startHealthServer(worker)
  // On shutdown: healthServer.close()

Constraints:
  - /healthz must NEVER hit DB or Redis (liveness = "process is running")
  - /readyz hits both DB and Redis (readiness = "can serve traffic")
  - Health checks must respond in < 1 second (use connection timeout)
  - TypeScript strict mode

Output: Both health.ts files
```

### 🧪 Testing Instructions

```
1. Start gateway: docker compose up gateway
2. GET /healthz → 200 { status: 'ok' }
3. GET /readyz with DB up → 200 { status: 'ready', checks: { postgres: true, redis: true } }
4. Stop Postgres: docker compose stop postgres
5. GET /readyz → 503 { status: 'not ready', checks: { postgres: false, redis: true } }

6. Agent worker health:
   GET http://localhost:9090/health → 200 { status: 'ok', checks: { queue: 'running', s3: true } }

7. K8s probe test (after Helm deploy):
   kubectl describe pod gateway-xxx → events should show "Liveness probe succeeded"
   kubectl describe pod agent-worker-xxx → "Readiness probe succeeded"
```

### ✅ Acceptance Criteria

- [ ] `/healthz` always returns 200 (no DB/Redis dependency)
- [ ] `/readyz` returns 503 if Postgres OR Redis is unreachable
- [ ] Agent Worker `/health` on port 9090 reflects queue running state
- [ ] S3 reachability included in agent-worker health check
- [ ] Response time < 1 second (health check timeout)
- [ ] Kubernetes liveness/readiness probes use these endpoints

---

## 🧾 DEPLOY-5: Gateway Service Entry Point and Route Registration

### 🎯 Description

Implement the main `index.ts` entry point for the Gateway Pod. It creates the Express HTTP server, registers all routes in correct order (JWKS before auth middleware, webhooks with raw body, team routes with JSON body), starts the WebSocket server, loads workspace secrets, and begins the channel reply subscriber.

Source: `08-code-change-plan/README.md` — "Gateway Service (~1,200 lines)" file list.

### ⚙️ Implementation Details

**File to create:**
- `services/gateway/src/index.ts`

**Route registration order (CRITICAL):**
```
1. Raw body middleware (for /webhooks/* only)
2. JWKS endpoint (no auth)
3. Health routes (no auth)
4. Cookie parser + JSON body parser
5. Auth routes (no auth middleware)
6. Auth middleware (all subsequent routes require auth)
7. Team routes (with CSRF protection on write endpoints)
8. Webhook routes (raw body, no session auth — use HMAC verification)
9. Static file serving (login.html, team.html)
10. 404 handler
11. Error handler
```

**Startup sequence:**
```
1. Validate required env vars
2. Connect to Postgres (run migrate())
3. Connect to Redis
4. Load workspace secrets (decrypt from Postgres)
5. Register JWT key material
6. Start HTTP server
7. Start WebSocket server
8. Start channel reply subscriber (Redis pub/sub)
9. Log startup complete
```

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Create services/gateway/src/index.ts — Gateway Pod entry point.

Requirements:

1. Validate env vars at startup:
   const required = ['DATABASE_URL', 'REDIS_URL', 'OPENCLAW_S3_BUCKET', 'OPENCLAW_JWT_PRIVATE_KEY', 'OPENCLAW_JWT_PUBLIC_KEY', 'OPENCLAW_COOKIE_SECRET', 'OPENCLAW_QUEUE_SECRET']
   Check each, throw if missing

2. Create Express app:
   const app = express()

3. Register routes in order:
   a. app.use(express.raw({ type: 'application/json', limit: '10mb' }), (req, res, next) => {
        // Only keep rawBody for webhook paths
        if (req.path.startsWith('/webhooks')) { req.rawBody = req.body; } next()
      })
   b. app.get('/.well-known/jwks.json', ...) [from jwt.ts — no auth]
   c. registerHealthRoutes(app)
   d. app.use(express.json({ limit: '1mb' }))
   e. app.use(cookieParser())
   f. app.use('/auth', authRouter)  [login, logout, me — no auth middleware]
   g. app.use(authMiddleware)  [ALL routes below require auth]
   h. app.use('/team', csrfProtect, teamRouter)
   i. app.use('/webhooks', webhookRouter)  [uses HMAC, not session auth]
   j. app.use('/', webRouter)  [login.html, team.html]
   k. 404 handler
   l. Error handler (log + 500)

4. Start servers:
   const httpServer = app.listen(parseInt(process.env.PORT || '8080'), ...)
   createWsServer(httpServer)  [WebSocket relay on same port]

5. Startup sequence:
   await migrate(getPool())
   await loadWorkspaceSecrets()
   await startChannelReplySender()
   httpServer.listen(...)

6. Graceful shutdown:
   SIGTERM: close httpServer → disconnect Redis → close Postgres pool → exit 0

Constraints:
  - Webhook routes MUST get rawBody (for HMAC verification)
  - Auth middleware applied AFTER public routes (health, JWKS, auth login)
  - Express error handler must catch async errors (use express-async-errors or wrapper)
  - TypeScript strict mode
  - Structured logging (pino)

Output: Complete index.ts
```

### 🧪 Testing Instructions

```
1. Start gateway with valid env
2. Public routes (no auth needed):
   GET /healthz → 200
   GET /.well-known/jwks.json → 200 with keys array
   GET /login → 200 with HTML

3. Protected route without auth:
   GET /team/users → 401

4. Protected route with auth:
   GET /team/users with valid JWT cookie → 200

5. Webhook route (HMAC auth, not session auth):
   POST /webhooks/whatsapp/ws-1 with valid HMAC → 200
   POST /webhooks/whatsapp/ws-1 with invalid HMAC → 401

6. Graceful shutdown:
   Send SIGTERM → server closes gracefully (existing requests complete)
   → Process exits 0
```

### ✅ Acceptance Criteria

- [ ] Webhook routes receive raw body (before JSON parse) for HMAC verification
- [ ] JWKS endpoint accessible without authentication
- [ ] Auth middleware applied to all `/team/*` routes
- [ ] WebSocket server shares port 8080 with HTTP server
- [ ] Channel reply subscriber started at startup
- [ ] Workspace secrets loaded from Postgres at startup
- [ ] Graceful shutdown on SIGTERM

---

## 🧾 DEPLOY-6: Environment Variables Validation and Documentation

### 🎯 Description

Create a centralized env-var validation module that runs at startup for both Gateway and Agent Worker, providing clear error messages when required variables are missing. Also create complete `.env.example` documentation.

Source: `07-kubernetes-deployment/README.md` — "Environment Variables (Complete List)" table (18 env vars).

### ⚙️ Implementation Details

**File to create:**
- `services/shared/src/config/env.ts`

**All env vars with descriptions:**
```
Required for ALL Pods:
  OPENCLAW_TEAM_MODE=1
  DATABASE_URL=postgres://...
  REDIS_URL=redis://...
  OPENCLAW_S3_BUCKET=openclaw-workspace
  OPENCLAW_QUEUE_SECRET=<32 random bytes hex>

Required for Gateway only:
  OPENCLAW_JWT_PRIVATE_KEY=<PEM>
  OPENCLAW_JWT_PUBLIC_KEY=<PEM>
  OPENCLAW_GATEWAY_TOKEN=<legacy token>
  OPENCLAW_COOKIE_SECRET=<32 chars>
  OPENCLAW_SECRETS_KEY=<base64 32 bytes>
  OPENCLAW_TEAM_ADMIN_EMAIL=<bootstrap>
  OPENCLAW_TEAM_ADMIN_PASSWORD=<bootstrap>
  OPENCLAW_PUBLIC_BASE_URL=https://...

Required for Agent Worker:
  OPENCLAW_JWT_PUBLIC_KEY=<PEM>  (also needed here for JWKS verification)

Optional:
  S3_ENDPOINT=http://minio:9000  (MinIO; omit for AWS S3)
  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
  TELEGRAM_BOT_TOKEN
  BROWSER_POOL_URL=http://browser-pool:50051
  WORKER_CONCURRENCY=5
  DATABASE_POOL_SIZE=10
```

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Create services/shared/src/config/env.ts

Requirements:

Export function validateEnv(required: string[], context: string): void:
  const missing = required.filter(key => !process.env[key])
  if (missing.length > 0):
    console.error('[' + context + '] Missing required environment variables:')
    missing.forEach(key => console.error('  - ' + key))
    console.error('Check .env.example for documentation.')
    process.exit(1)

Export const GATEWAY_REQUIRED = [
  'OPENCLAW_TEAM_MODE',
  'DATABASE_URL',
  'REDIS_URL',
  'OPENCLAW_S3_BUCKET',
  'OPENCLAW_QUEUE_SECRET',
  'OPENCLAW_JWT_PRIVATE_KEY',
  'OPENCLAW_JWT_PUBLIC_KEY',
  'OPENCLAW_COOKIE_SECRET',
  'OPENCLAW_SECRETS_KEY',
]

Export const AGENT_WORKER_REQUIRED = [
  'OPENCLAW_TEAM_MODE',
  'DATABASE_URL',
  'REDIS_URL',
  'OPENCLAW_S3_BUCKET',
  'OPENCLAW_QUEUE_SECRET',
  'OPENCLAW_JWT_PUBLIC_KEY',
]

Export const BOOTSTRAP_REQUIRED = [
  'DATABASE_URL',
  'OPENCLAW_S3_BUCKET',
]

In gateway/src/index.ts: validateEnv(GATEWAY_REQUIRED, 'Gateway')
In agent-worker/src/index.ts: validateEnv(AGENT_WORKER_REQUIRED, 'AgentWorker')
In gateway/src/bootstrap.ts: validateEnv(BOOTSTRAP_REQUIRED, 'Bootstrap')

Also create scripts/generate-secrets.sh:
  #!/bin/bash
  # Generates all required secret values for .env.local
  echo "OPENCLAW_GATEWAY_TOKEN=$(openssl rand -hex 32)"
  echo "OPENCLAW_COOKIE_SECRET=$(openssl rand -hex 32)"
  echo "OPENCLAW_QUEUE_SECRET=$(openssl rand -hex 32)"
  echo "OPENCLAW_SECRETS_KEY=$(openssl rand -base64 32)"
  openssl genrsa 2048 2>/dev/null | sed 's/$/\\n/' | tr -d '\n'
  # (guide user to copy PEM into env var)

Constraints:
  - validateEnv must print ALL missing vars at once (not one by one)
  - Exit code 1 on any missing variable
  - OPENCLAW_TEAM_MODE must equal '1' (not just truthy) — add specific check

Output: env.ts + generate-secrets.sh
```

### 🧪 Testing Instructions

```
1. Start gateway with missing DATABASE_URL:
   unset DATABASE_URL
   node dist/services/gateway/src/index.js
   → Error: Missing required environment variables: DATABASE_URL
   → Exit 1

2. Start with all required set:
   → No env error, proceeds to startup

3. Run generate-secrets.sh:
   bash scripts/generate-secrets.sh
   → All secrets printed in .env format
   → Values are random (different each run)

4. Test OPENCLAW_TEAM_MODE check:
   OPENCLAW_TEAM_MODE=0 node dist/services/gateway/src/index.js
   → Error: OPENCLAW_TEAM_MODE must be '1'
   → Exit 1
```

### ✅ Acceptance Criteria

- [ ] All missing env vars printed at once (not one at a time)
- [ ] Process exits 1 immediately on missing required vars
- [ ] Clear error message with variable names and reference to `.env.example`
- [ ] `GATEWAY_REQUIRED`, `AGENT_WORKER_REQUIRED`, `BOOTSTRAP_REQUIRED` lists match design doc
- [ ] `generate-secrets.sh` produces all required secret values
- [ ] `OPENCLAW_TEAM_MODE` specifically checked for value `'1'`
