# Docker Deployment

## Purpose
Document Docker containerization and deployment.

## Findings

### Docker Architecture

```
Docker Image
  -> Node.js 22 Alpine/Debian base
    -> Built application (dist/ + ui/dist/)
      -> Single container runs gateway + CLI
        -> Ports: 3000 (gateway), 3001 (bridge)
```

### Dockerfile

- Multi-stage build
- Stage 1: Build environment (Node.js + pnpm + source)
- Stage 2: Runtime (Node.js only + built artifacts)
- Final image size: ~200-300MB

### docker-compose.yml

```yaml
services:
  openclaw-gateway:
    image: openclaw/openclaw:latest
    ports:
      - "3000:3000"   # Gateway HTTP/WebSocket
      - "3001:3001"   # Bridge port
    environment:
      - OPENCLAW_GATEWAY_TOKEN=<token>
      - OPENCLAW_MODEL_PROVIDER=openai
      - OPENCLAW_MODEL=gpt-4o
    volumes:
      - openclaw-data:/root/.openclaw
  openclaw-cli:
    image: openclaw/openclaw:latest
    command: ["cli"]
    environment:
      - OPENCLAW_GATEWAY_URL=http://gateway:3000
      - OPENCLAW_GATEWAY_TOKEN=<token>
    depends_on:
      - openclaw-gateway
```

### Environment Variables (Docker)

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENCLAW_GATEWAY_TOKEN` | Yes | Auth token |
| `OPENCLAW_STATE_DIR` | No | Data volume path |
| `OPENCLAW_CONFIG` | No | Config file path |
| `OPENCLAW_LOG_LEVEL` | No | Logging level |
| `TZ` | No | Timezone |

### Volumes

- `openclaw-data` — persistent state (config, sessions, media)
- `/root/.openclaw` — default state directory in container
- No secrets mounted as files (env vars only)

### Networking

- Gateway exposed on host port 3000
- Bridge port 3001 for CLI connection
- Internal network between gateway and CLI
- No external database dependency

### Docker Tags

- `latest` — latest stable release
- `vX.Y.Z` — specific version
- `edge` — latest main branch build
- `sha-<hash>` — specific commit

### Sandbox Containers

- `Dockerfile.sandbox` — lightweight sandbox for tool execution
- `Dockerfile.sandbox-browser` — browser automation sandbox
- Sandboxes run as separate containers started by gateway
- No Docker-in-Docker (DinD) — uses host Docker socket

### Health Checks

- Gateway exposes `/health` endpoint
- Docker HEALTHCHECK configured
- Returns 200 OK when all subsystems ready

### Resource Limits

- No default CPU/memory limits
- Recommend: 2GB RAM minimum, 1 CPU core
- LLM inference (if local) requires GPU passthrough
- Media processing may spike CPU

## Evidence
- `Dockerfile` — main image
- `docker-compose.yml` — compose config
- `Dockerfile.sandbox` — sandbox image
- `Dockerfile.sandbox-browser` — browser sandbox
- `.dockerignore` — build exclusions

## Notes
- Single container design (gateway + CLI in one image)
- No Kubernetes manifests or Helm charts detected
- No Docker Swarm configs
- Volume is critical for state persistence
- Container restart recommended for config changes
