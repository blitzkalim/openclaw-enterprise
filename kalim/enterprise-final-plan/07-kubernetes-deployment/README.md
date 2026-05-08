# 07 — Kubernetes Deployment

## Deployment Topology

```
┌──────────────────────────────────────────────────────────────────────┐
│  Kubernetes Cluster (1 namespace: openclaw)                          │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Ingress (nginx-ingress or cloud ALB)                          │  │
│  │  TLS termination, path routing                                 │  │
│  │  *.example.com → gateway Service                               │  │
│  └───────────────────────┬────────────────────────────────────────┘  │
│                          │                                           │
│  ┌───────────────────────▼────────────────────────────────────────┐  │
│  │  Deployment: gateway  (Pod 1)                                  │  │
│  │  Replicas: 2–10 (HPA on CPU/requests)                          │  │
│  │  Image: ghcr.io/openclaw/openclaw-gateway:latest               │  │
│  │  Ports: 8080 (HTTP), 8081 (WS)                                 │  │
│  │  Probes: /healthz (liveness), /readyz (readiness)              │  │
│  └───────────────────────┬────────────────────────────────────────┘  │
│                          │                                           │
│  ┌───────────────────────▼────────────────────────────────────────┐  │
│  │  Deployment: agent-worker  (Pod 2)                              │  │
│  │  Replicas: 2–20 (HPA on BullMQ queue depth)                    │  │
│  │  Image: ghcr.io/openclaw/openclaw-agent-worker:latest          │  │
│  │  Volumes: emptyDir(/tmp/scratch), PVC(lancedb, RWX)            │  │
│  │  Probes: BullMQ health check                                   │  │
│  └───────────────────────┬────────────────────────────────────────┘  │
│                          │                                           │
│  ┌───────────────────────▼────────────────────────────────────────┐  │
│  │  StatefulSet: infra  (Pod 3)                                    │  │
│  │  OR managed services (RDS + Elasticache + S3)                   │  │
│  │                                                                 │  │
│  │  Container 1: postgres:16                                       │  │
│  │    Port: 5432                                                   │  │
│  │    PVC: openclaw-pg-data (10 Gi, ReadWriteOnce)                 │  │
│  │                                                                 │  │
│  │  Container 2: redis:7-alpine                                    │  │
│  │    Port: 6379                                                   │  │
│  │    PVC: openclaw-redis-data (1 Gi, ReadWriteOnce)               │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Deployment: browser-pool  (Pod 4, OPTIONAL)                   │  │
│  │  Replicas: 0–5 (HPA on active sessions)                        │  │
│  │  Image: ghcr.io/openclaw/openclaw-browser-pool:latest          │  │
│  │  Resources: 2 Gi RAM minimum per replica                       │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Shared Storage                                                 │  │
│  │  Option A: MinIO (Deployment + PVC)                             │  │
│  │  Option B: AWS S3 (external)                                    │  │
│  │  Option C: ReadWriteMany PVC (EFS/NFS)                          │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Job: bootstrap (runs once on first deploy)                    │  │
│  │  Image: ghcr.io/openclaw/openclaw-gateway:latest               │  │
│  │  Command: node dist/bootstrap.js                               │  │
│  │  Creates: admin user, schema migration, base/ seed upload       │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Helm Chart Structure

```
charts/openclaw/
  Chart.yaml
  values.yaml
  values-dev.yaml           ← local/dev overrides (MinIO, single replicas)
  values-prod.yaml          ← production overrides (managed RDS/Elasticache/S3)
  templates/
    _helpers.tpl
    namespace.yaml
    secrets.yaml
    configmap.yaml
    ingress.yaml
    gateway-deployment.yaml
    gateway-service.yaml
    gateway-hpa.yaml
    agent-worker-deployment.yaml
    agent-worker-hpa.yaml
    infra-statefulset.yaml       ← Postgres + Redis (or omitted if managed)
    browser-pool-deployment.yaml  ← optional
    browser-pool-hpa.yaml        ← optional
    bootstrap-job.yaml
    pvc-lancedb.yaml
    pvc-postgres.yaml
    pvc-redis.yaml
    networkpolicy.yaml
```

---

## values.yaml (Default)

```yaml
global:
  teamMode: true
  namespace: openclaw
  imagePullPolicy: Always

gateway:
  image: ghcr.io/openclaw/openclaw-gateway
  tag: latest
  replicas: 2
  resources:
    requests:
      cpu: 250m
      memory: 512Mi
    limits:
      cpu: "1"
      memory: 1Gi
  hpa:
    enabled: true
    minReplicas: 2
    maxReplicas: 10
    targetCPUUtilization: 70
  env:
    OPENCLAW_TEAM_MODE: "1"
    OPENCLAW_PUBLIC_BASE_URL: "https://oc.example.com"

agentWorker:
  image: ghcr.io/openclaw/openclaw-agent-worker
  tag: latest
  replicas: 2
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: "2"
      memory: 4Gi
  hpa:
    enabled: true
    minReplicas: 2
    maxReplicas: 20
    metricName: bullmq_queue_depth
    targetValue: 5
  scratchVolume:
    sizeLimit: 2Gi

browserPool:
  enabled: false               # Set to true if browser automation needed
  image: ghcr.io/openclaw/openclaw-browser-pool
  tag: latest
  replicas: 1
  resources:
    requests:
      cpu: 500m
      memory: 2Gi
    limits:
      cpu: "2"
      memory: 4Gi

infra:
  managed: false               # true = use RDS/Elasticache/S3; false = in-cluster
  postgres:
    image: postgres:16-alpine
    storage: 10Gi
    storageClass: gp3
  redis:
    image: redis:7-alpine
    storage: 1Gi

storage:
  type: minio                  # 'minio', 's3', or 'pvc'
  minio:
    image: minio/minio:latest
    storage: 50Gi
    rootUser: minioadmin
    rootPassword: ""           # Set via secret
  s3:
    bucket: openclaw-workspace
    region: ap-south-1
  pvc:
    storageClass: efs
    size: 50Gi

lancedb:
  pvc:
    size: 10Gi
    accessMode: ReadWriteMany
    storageClass: efs           # Must support RWX

ingress:
  enabled: true
  className: nginx
  host: oc.example.com
  tls:
    enabled: true
    secretName: openclaw-tls    # cert-manager or pre-provisioned

secrets:
  # All values should come from external secret management in production
  gatewayToken: ""
  jwtPrivateKey: ""
  jwtPublicKey: ""
  cookieSecret: ""
  adminEmail: ""
  adminPassword: ""
  databaseUrl: ""
  redisUrl: ""
  s3AccessKey: ""
  s3SecretKey: ""
  secretsEncryptionKey: ""     # For workspace_secrets AES-256-GCM
```

---

## Environment Variables (Complete List)

| Var | Pod(s) | Purpose |
|---|---|---|
| `OPENCLAW_TEAM_MODE` | All | Master toggle (`1` = enabled) |
| `DATABASE_URL` | Gateway, Agent Worker | Postgres connection string |
| `REDIS_URL` | Gateway, Agent Worker | Redis connection string |
| `OPENCLAW_S3_BUCKET` | Gateway, Agent Worker | S3/MinIO bucket name |
| `S3_ENDPOINT` | Gateway, Agent Worker | MinIO endpoint (omit for AWS S3) |
| `AWS_ACCESS_KEY_ID` | Gateway, Agent Worker | S3/MinIO credentials |
| `AWS_SECRET_ACCESS_KEY` | Gateway, Agent Worker | S3/MinIO credentials |
| `OPENCLAW_JWT_PRIVATE_KEY` | Gateway only | RS256 private key (PEM) |
| `OPENCLAW_JWT_PUBLIC_KEY` | Gateway, Agent Worker | RS256 public key (PEM) |
| `OPENCLAW_GATEWAY_TOKEN` | Gateway | Legacy bearer token |
| `OPENCLAW_COOKIE_SECRET` | Gateway | CSRF token signing |
| `OPENCLAW_SECRETS_KEY` | Gateway | AES-256-GCM key for workspace_secrets |
| `OPENCLAW_TEAM_ADMIN_EMAIL` | Bootstrap job | First-run admin account |
| `OPENCLAW_TEAM_ADMIN_PASSWORD` | Bootstrap job | First-run admin password |
| `OPENCLAW_PUBLIC_BASE_URL` | Gateway | For webhook URL generation |
| `OPENCLAW_TEAM_ALLOW_SIGNUP` | Gateway | Optional self-registration (`1`) |
| `OPENAI_API_KEY` (etc.) | Agent Worker | LLM provider keys |
| `TELEGRAM_BOT_TOKEN` | Gateway | For outbound Telegram replies |
| `BROWSER_POOL_URL` | Agent Worker | gRPC endpoint for Pod 4 (if enabled) |

---

## First-Run Bootstrap

A Kubernetes Job runs once on first deploy:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: openclaw-bootstrap
  annotations:
    helm.sh/hook: post-install
    helm.sh/hook-weight: "10"
    helm.sh/hook-delete-policy: hook-succeeded
spec:
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: bootstrap
          image: ghcr.io/openclaw/openclaw-gateway:latest
          command: ["node", "dist/bootstrap.js"]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: openclaw-secrets
                  key: database-url
            - name: OPENCLAW_TEAM_ADMIN_EMAIL
              valueFrom:
                secretKeyRef:
                  name: openclaw-secrets
                  key: admin-email
            - name: OPENCLAW_TEAM_ADMIN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: openclaw-secrets
                  key: admin-password
            - name: OPENCLAW_S3_BUCKET
              value: openclaw-workspace
```

Bootstrap script:
1. Run Postgres schema migration
2. Create admin user (if `users` table is empty)
3. Upload `base/SOUL.md` and `base/AGENTS.md` to S3 (if not present)
4. Exit 0

---

## Network Policies

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: gateway-policy
spec:
  podSelector:
    matchLabels:
      app: openclaw-gateway
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - namespaceSelector: {}     # Allow from ingress controller
      ports:
        - port: 8080
        - port: 8081
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: openclaw-infra
      ports:
        - port: 5432               # Postgres
        - port: 6379               # Redis
    - to:                           # S3/MinIO
        - podSelector:
            matchLabels:
              app: openclaw-minio
      ports:
        - port: 9000
    - to: []                        # External: Meta API, Telegram API, LLM APIs
      ports:
        - port: 443
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: agent-worker-policy
spec:
  podSelector:
    matchLabels:
      app: openclaw-agent-worker
  policyTypes: [Ingress, Egress]
  ingress: []                       # No inbound traffic — queue consumer only
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: openclaw-infra
      ports:
        - port: 5432
        - port: 6379
    - to:
        - podSelector:
            matchLabels:
              app: openclaw-minio
      ports:
        - port: 9000
    - to:
        - podSelector:
            matchLabels:
              app: openclaw-browser-pool
      ports:
        - port: 50051              # gRPC
    - to: []                        # External: LLM APIs
      ports:
        - port: 443
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: infra-policy
spec:
  podSelector:
    matchLabels:
      app: openclaw-infra
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: openclaw-gateway
        - podSelector:
            matchLabels:
              app: openclaw-agent-worker
      ports:
        - port: 5432
        - port: 6379
  egress: []                        # Infra pods don't initiate outbound
```

---

## Health Checks

| Pod | Liveness | Readiness |
|---|---|---|
| Gateway | `GET /healthz` → 200 | `GET /readyz` → 200 (checks Postgres + Redis connectivity) |
| Agent Worker | BullMQ worker `isRunning()` check | Same + S3 head-bucket check |
| Infra (Postgres) | `pg_isready` | Same |
| Infra (Redis) | `redis-cli ping` | Same |
| Browser Pool | `GET /health` | Same + browser process count |

---

## Resource Sizing Guide

| Team Size | Gateway Replicas | Agent Worker Replicas | Infra | Storage | Monthly Cost (AWS) |
|---|---|---|---|---|---|
| 1–5 users | 1 | 1 | t3.small (Postgres+Redis in Pod) | MinIO 20 Gi | ~$40 |
| 5–20 users | 2 | 2–3 | t3.medium | MinIO 50 Gi | ~$100 |
| 20–50 users | 2–3 | 5–10 | RDS db.t3.small + Elasticache t3.micro | S3 | ~$200 |
| 50–100 users | 3–5 | 10–20 | RDS db.t3.medium + Elasticache t3.small | S3 | ~$500 |

---

## Local Development with Docker Compose

For local dev, the same images run in Docker Compose:

```yaml
version: '3.8'
services:
  gateway:
    image: ghcr.io/openclaw/openclaw-gateway:latest
    ports: ['8080:8080', '8081:8081']
    environment:
      OPENCLAW_TEAM_MODE: '1'
      DATABASE_URL: postgres://openclaw:openclaw@postgres:5432/openclaw
      REDIS_URL: redis://redis:6379
      S3_ENDPOINT: http://minio:9000
      OPENCLAW_S3_BUCKET: openclaw-workspace
      AWS_ACCESS_KEY_ID: minioadmin
      AWS_SECRET_ACCESS_KEY: minioadmin
      OPENCLAW_GATEWAY_TOKEN: ${OPENCLAW_GATEWAY_TOKEN}
      OPENCLAW_JWT_PRIVATE_KEY_FILE: /run/secrets/jwt-private
      OPENCLAW_JWT_PUBLIC_KEY_FILE: /run/secrets/jwt-public
    depends_on: [postgres, redis, minio]

  agent-worker:
    image: ghcr.io/openclaw/openclaw-agent-worker:latest
    environment:
      OPENCLAW_TEAM_MODE: '1'
      DATABASE_URL: postgres://openclaw:openclaw@postgres:5432/openclaw
      REDIS_URL: redis://redis:6379
      S3_ENDPOINT: http://minio:9000
      OPENCLAW_S3_BUCKET: openclaw-workspace
      AWS_ACCESS_KEY_ID: minioadmin
      AWS_SECRET_ACCESS_KEY: minioadmin
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    depends_on: [postgres, redis, minio]

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: openclaw
      POSTGRES_PASSWORD: openclaw
      POSTGRES_DB: openclaw
    volumes:
      - pg-data:/var/lib/postgresql/data
    ports: ['5432:5432']

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']
    volumes:
      - redis-data:/data

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports: ['9000:9000', '9001:9001']
    volumes:
      - minio-data:/data

volumes:
  pg-data:
  redis-data:
  minio-data:
```

This gives developers the exact same topology as production but running locally.
