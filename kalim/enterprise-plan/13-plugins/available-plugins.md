# Available Plugins

## Purpose
Catalog all plugins/extensions found in the repository.

## Findings

### Channel Extensions

| Extension | ID | Path | Published |
|-----------|-----|------|-----------|
| WhatsApp | `whatsapp` | `extensions/whatsapp/` | Yes |
| Telegram | `telegram` | `extensions/telegram/` | No (private) |
| Discord | `discord` | `extensions/discord/` | Yes |
| Slack | `slack` | `extensions/slack/` | Yes |
| Signal | `signal` | `extensions/signal/` | Yes |
| iMessage | `imessage` | `extensions/imessage/` | Yes |
| Matrix | `matrix` | `extensions/matrix/` | Yes |
| MS Teams | `msteams` | `extensions/msteams/` | Yes |
| Google Chat | `googlechat` | `extensions/googlechat/` | Yes |
| LINE | `line` | `extensions/line/` | Yes |
| Zalo | `zalo` | `extensions/zalo/` | Yes |
| Feishu | `feishu` | `extensions/feishu/` | Yes |
| Mattermost | `mattermost` | `extensions/mattermost/` | Yes |
| IRC | `irc` | `extensions/irc/` | Yes |
| Nostr | `nostr` | `extensions/nostr/` | Yes |
| Twitch | `twitch` | `extensions/twitch/` | Yes |
| Nextcloud Talk | `nextcloud-talk` | `extensions/nextcloud-talk/` | Yes |
| QQ Bot | `qqbot` | `extensions/qqbot/` | Yes |
| Webhooks | `webhooks` | `extensions/webhooks/` | Yes |
| BlueBubbles | `bluebubbles` | `extensions/bluebubbles/` | Yes |

### LLM Provider Extensions

| Extension | ID | Local/Remote |
|-----------|-----|-------------|
| OpenAI | `openai` | Remote |
| Anthropic | `anthropic` | Remote |
| Google | `google` | Remote |
| DeepSeek | `deepseek` | Remote |
| Mistral | `mistral` | Remote |
| OpenRouter | `openrouter` | Remote |
| Ollama | `ollama` | Local |
| LM Studio | `lmstudio` | Local |
| Azure OpenAI | `azure-openai` | Remote |
| Together | `together` | Remote |
| Fireworks | `fireworks` | Remote |
| Groq | `groq` | Remote |
| Cohere | `cohere` | Remote |
| ZAI | `zai` | Remote |
| AI Gateway | `ai-gateway` | Remote |
| TokenHub | `tokenhub` | Remote |
| LKEAP | `lkeap` | Remote |
| MiniMax | `minimax` | Remote |
| Synthetic | `synthetic` | Remote |

### Tool / Integration Extensions

| Extension | Purpose |
|-----------|---------|
| `browser` | Browser automation (CDP) |
| `memory-core` | Vector memory / embeddings |
| `memory-lancedb` | LanceDB vector store |
| `brave` | Brave Search |
| `perplexity` | Perplexity search |
| `firecrawl` | Web extraction |
| `elevenlabs` | TTS |
| `azure-speech` | Azure Speech |
| `deepgram` | STT |
| `github-copilot` | Copilot proxy |
| `codex` | OpenAI Codex |
| `device-pair` | Device pairing |
| `copilot-proxy` | Copilot proxy |

### Diagnostics Extensions

| Extension | Purpose |
|-----------|---------|
| `diagnostics-otel` | OpenTelemetry |
| `diagnostics-prometheus` | Prometheus metrics |

### QA / Test Extensions

| Extension | Purpose |
|-----------|---------|
| `qa-*` | Various QA infrastructure |
| `test-support` | Test utilities |

### Other Extensions

| Extension | Purpose |
|-----------|---------|
| `acpx` | ACP extensions |
| `active-memory` | Active memory |
| `alibaba` | Alibaba Cloud |
| `amazon-bedrock` | AWS Bedrock |
| `music-generation-providers` | Music generation |
| `image-generation-providers` | Image generation |
| `video-generation-providers` | Video generation |

## Evidence
- `extensions/*/package.json` — extension metadata
- `pnpm-workspace.yaml` — workspace listing
- `src/plugins/runtime/runtime-registry-loader.ts` — registry loading

## Notes
- ~120+ extensions total
- Some extensions are platform-specific (iMessage = macOS only)
- Some extensions require additional binaries (Signal = signal-cli)
- Not all extensions are published to npm (e.g., Telegram is private)
- Extensions can be dynamically installed via `openclaw install <pkg>`
