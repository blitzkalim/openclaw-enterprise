# DevOps & Deployment

## Docker Deployment

### docker-compose.yml

```yaml
services:
  openclaw-gateway:
    image: ${OPENCLAW_IMAGE:-openclaw:local}
    ports:
      - "18789:18789"
      - "18788:18788"  # Bridge port
    environment:
      OPENCLAW_GATEWAY_TOKEN: ${OPENCLAW_GATEWAY_TOKEN}
      OPENCLAW_ALLOW_INSECURE_PRIVATE_WS: "true"
      OPENCLAW_DISABLE_BONJOUR: "false"
      OTEL_SERVICE_NAME: openclaw-gateway
    volumes:
      - ./config:/root/.openclaw/config
      - ./workspace:/root/.openclaw/workspace
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:18789/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  openclaw-cli:
    image: ${OPENCLAW_IMAGE:-openclaw:local}
    environment:
      BROWSER: echo
    volumes:
      - ./config:/root/.openclaw/config
      - ./workspace:/root/.openclaw/workspace
    # Interacts with gateway via network
```

### Dockerfile (inferred)

```dockerfile
FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 18789 18788
CMD ["node", "dist/index.js", "gateway"]
```

## Installation Methods

| Method | Command | Target |
|--------|---------|--------|
| npm | `npm install -g openclaw` | Global CLI |
| pnpm | `pnpm install -g openclaw` | Global CLI |
| Docker | `docker compose up` | Containerized |
| Source | `git clone && pnpm install && pnpm build` | Development |
| Onboard | `openclaw onboard` | Interactive setup |

## Environment Configuration

```bash
# .env file
OPENCLAW_GATEWAY_TOKEN=your-secret-token
OPENCLAW_GATEWAY_PASSWORD=your-password
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=...
```

## Reverse Proxy Setup

```nginx
# nginx example
server {
  listen 443 ssl;
  server_name openclaw.example.com;

  location / {
    proxy_pass http://localhost:18789;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

## mDNS / Bonjour Discovery

Gateway advertises itself via mDNS (if enabled):
- Service: `_openclaw._tcp.local`
- Port: 18789
- Used by native apps to auto-discover local gateway

## Health Checks

- **HTTP**: `GET /health` → `{ status: "ok" }`
- **Docker**: Built-in healthcheck via curl
- **Readiness**: Channels ready, plugins loaded

## Scaling Notes

- **Single-process**: Gateway is single Node.js process
- **File storage**: Not horizontally scalable (no shared state)
- **WebSocket**: Sticky sessions needed if behind load balancer
- **Recommendation**: Run one instance per user/device

## Key Files

- `docker-compose.yml` — Docker orchestration
- `Dockerfile` — Container image (if present)
- `package.json` — Scripts and dependencies
- `.env.example` — Environment template
- `README.md` — Installation instructions

---

*Evidence: `docker-compose.yml`, `.env.example`, `README.md`, `package.json` scripts.*
