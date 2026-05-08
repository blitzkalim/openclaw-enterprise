# Flow G: DevOps Deployment & Scaling

## Scenario
Deploy OpenClaw TeamOS platform to Kubernetes cluster.

## Initial Deployment

### 1. Prerequisites
```bash
# Cluster: 3 nodes, 4 CPU / 16GB RAM each
kubectl version  # 1.28+
helm version     # 3.12+

# Namespaces
kubectl create namespace openclaw
kubectl create namespace openclaw-data
kubectl create namespace openclaw-monitoring
```

### 2. Secrets Setup
```bash
# Create secrets from environment
kubectl create secret generic openclaw-secrets \
  --namespace openclaw \
  --from-literal=DATABASE_URL='postgresql://...' \
  --from-literal=REDIS_URL='redis://...' \
  --from-literal=MASTER_KEY='...' \
  --from-literal=STRIPE_SECRET_KEY='...' \
  --from-literal=OPENAI_API_KEY='...' \
  --from-literal=JWT_SECRET='...'
```

### 3. Database Migration Job
```yaml
# Job runs before any pods start
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
  namespace: openclaw
spec:
  template:
    spec:
      restartPolicy: OnFailure
      containers:
      - name: migrate
        image: openclaw-teamos:latest
        command: ["pnpm", "run", "migrate:up"]
        envFrom:
        - secretRef:
            name: openclaw-secrets
```

### 4. Core Services Deployment
```yaml
# Gateway deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openclaw-gateway
  namespace: openclaw
spec:
  replicas: 2
  selector:
    matchLabels:
      app: gateway
  template:
    metadata:
      labels:
        app: gateway
    spec:
      containers:
      - name: gateway
        image: openclaw-teamos:latest
        ports:
        - containerPort: 3000
        envFrom:
        - secretRef:
            name: openclaw-secrets
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /healthz
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /readyz
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

### 5. Ingress Configuration
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: openclaw-ingress
  namespace: openclaw
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - platform.openclaw-teamos.com
    - api.openclaw-teamos.com
    secretName: openclaw-tls
  rules:
  - host: platform.openclaw-teamos.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: admin-ui
            port:
              number: 80
  - host: api.openclaw-teamos.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: gateway
            port:
              number: 3000
```

### 6. Worker Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openclaw-worker
  namespace: openclaw
spec:
  replicas: 2
  selector:
    matchLabels:
      app: worker
  template:
    metadata:
      labels:
        app: worker
    spec:
      containers:
      - name: worker
        image: openclaw-teamos:latest
        command: ["pnpm", "run", "worker"]
        envFrom:
        - secretRef:
            name: openclaw-secrets
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
```

### 7. HPA (Horizontal Pod Autoscaler)
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: gateway-hpa
  namespace: openclaw
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: openclaw-gateway
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
```

### 8. WebSocket Handling
```yaml
# NGINX config for WebSocket support
nginx.ingress.kubernetes.io/configuration-snippet: |
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 86400;
```

### 9. Database StatefulSet
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: openclaw-data
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15-alpine
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_DB
          value: openclaw
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: db-secrets
              key: username
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-secrets
              key: password
        volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 50Gi
```

### 10. Monitoring Stack
```yaml
# Prometheus + Grafana
prometheus:
  enabled: true
  retention: 30d

grafana:
  enabled: true
  adminPassword: <from-secret>
  dashboards:
    - openclaw-overview.json
    - tenant-health.json
    - ai-performance.json
    - billing-metrics.json

loki:
  enabled: true
  retention: 7d
```

## Scaling Scenarios

### Scenario 1: 10 New Tenants Sign Up (Sudden Growth)
```
Auto-scaling response:
  - Gateway CPU: 45% -> 65%
  - HPA: Scale 2 -> 4 pods (within 2 minutes)
  - Postgres: Read replica handles dashboard queries
  - Redis: Connection pool auto-expands
  - No manual intervention needed
```

### Scenario 2: Viral Tenant (One Tenant Gets 10K Messages/Hour)
```
Alert triggers:
  - Gateway pod 1: CPU 95%
  - Messages queue: 5,000 pending

Auto-response:
  - HPA: Scale to max 20 pods
  - Rate limit tenant if > 20K/hour (fair use)
  - Alert platform admin
  - Offer tenant: "Upgrade to Enterprise for dedicated infrastructure"
```

### Scenario 3: Database Under Load
```
Symptoms:
  - Query latency > 500ms
  - Connection pool exhausted

Actions:
  - Scale read replicas: 1 -> 3
  - Enable PgBouncer (connection pooling)
  - Add index on slow queries (auto-detected)
  - Archive old conversations (> 1 year)
  - Alert if sustained > 10 minutes
```

### Scenario 4: Regional Expansion (Middle East)
```
New cluster in Dubai:
  - Deploy identical stack
  - Database: Async replication from India primary
  - Object storage: Cross-region replication
  - DNS: Geo-route users to nearest cluster
  - Billing: USD pricing for ME tenants
```

## Rollback Procedure

```bash
# 1. Identify last known good version
kubectl get deployments -n openclaw -o yaml | grep image

# 2. Rollback gateway
kubectl rollout undo deployment/openclaw-gateway -n openclaw

# 3. If database migration failed:
#    Run down migration
kubectl run migrate-down --rm -i --restart=Never \
  --image=openclaw-teamos:$PREVIOUS_VERSION \
  -- pnpm run migrate:down

# 4. Verify health
kubectl get pods -n openclaw
kubectl logs -n openclaw deployment/openclaw-gateway

# 5. Monitor error rate for 15 minutes
#    If > 1% error rate: escalate to on-call
```

## Backup & Disaster Recovery

### Daily Automated Backup
```bash
# CronJob at 2 AM
pg_dump -Fc openclaw > /backups/openclaw-$(date +%Y%m%d).dump
aws s3 cp /backups/openclaw-$(date +%Y%m%d).dump s3://openclaw-backups/daily/

# Redis persistence
redis-cli BGSAVE
aws s3 cp /var/lib/redis/dump.rdb s3://openclaw-backups/redis/
```

### Disaster Recovery (Region Failure)
```
RPO: 5 minutes (WAL archiving)
RTO: 30 minutes

Steps:
  1. DNS failover to secondary region
  2. Promote read replica to primary
  3. Scale gateway pods in secondary
  4. Verify webhook URLs (update if needed)
  5. Notify tenants of brief interruption
  6. Begin primary region recovery
```
