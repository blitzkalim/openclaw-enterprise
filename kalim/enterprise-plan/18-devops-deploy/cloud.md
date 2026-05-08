# Cloud Deployment

## Purpose
Document cloud deployment options and configurations.

## Findings

### Supported Platforms

1. **Fly.io**
   - `fly.toml` — Fly.io configuration
   - `fly.private.toml` — private networking config
   - Primary recommended platform
   - Features: automatic HTTPS, global load balancing, volumes

2. **Render**
   - `render.yaml` — Render Blueprint
   - Web service + disk configuration
   - Simple deployment from GitHub

3. **Docker (Generic)**
   - Any Docker-compatible platform
   - AWS ECS, GCP Cloud Run, Azure Container Apps
   - Self-managed Kubernetes possible

### Fly.io Configuration

```toml
app = "openclaw"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[[services]]
  internal_port = 3000
  protocol = "tcp"
  auto_stop_machines = false
  auto_start_machines = true

[[services.ports]]
  handlers = ["http"]
  port = 80
  force_https = true

[[services.ports]]
  handlers = ["tls", "http"]
  port = 443

[mounts]
  source = "openclaw_data"
  destination = "/root/.openclaw"
```

### Render Configuration

```yaml
services:
  - type: web
    name: openclaw
    runtime: docker
    dockerfilePath: ./Dockerfile
    envVars:
      - key: OPENCLAW_GATEWAY_TOKEN
        generateValue: true
      - key: OPENCLAW_STATE_DIR
        value: /var/data
    disk:
      name: openclaw-data
      mountPath: /var/data
      sizeGB: 10
```

### Environment-Specific Considerations

| Platform | Considerations |
|----------|---------------|
| Fly.io | Volumes limited to one region; no multi-region HA |
| Render | Disk is SSD but not distributed |
| AWS ECS | Need EFS for shared state across tasks |
| GCP Cloud Run | Stateless by default; need Cloud Filestore |
| Azure ACA | Azure Files for persistent storage |

### No Kubernetes Native Support

- No Helm charts detected
- No Kubernetes manifests in repo
- No operator or CRD definitions
- Community must create K8s configs manually

### Reverse Proxy / Ingress

- Gateway handles its own TLS termination (optional)
- Can run behind nginx/traefik/caddy
- WebSocket proxying required for real-time features
- Long timeouts needed for SSE streaming

### Scaling Considerations

- Single process architecture
- No horizontal scaling support
- State is local to container
- Multiple replicas require shared storage (not tested)

### Secrets Management

- Environment variables only
- No integration with AWS Secrets Manager, Azure Key Vault, etc.
- No Kubernetes secrets support
- Token must be provided at deploy time

### Monitoring in Cloud

- OpenTelemetry traces (if configured)
- Health endpoint for load balancer checks
- No built-in metrics endpoint for Prometheus
- Log to stdout (cloud-native logging)

## Evidence
- `fly.toml` — Fly.io config
- `fly.private.toml` — private Fly config
- `render.yaml` — Render config
- `Dockerfile` — container image
- `docker-compose.yml` — local Docker

## Notes
- Designed primarily for personal/single-user deployment
- Cloud deployment is straightforward but not enterprise-grade HA
- Volume is single point of failure
- No clustering or replication support
- Best suited for: Fly.io, Render, VPS with Docker
