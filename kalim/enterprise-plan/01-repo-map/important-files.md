# Top 100 Most Important Files

## Core Runtime & Bootstrap

| # | File | Purpose |
|---|------|---------|
| 1 | `src/runtime.ts` | Main runtime environment definition |
| 2 | `src/gateway/server.impl.ts` | Gateway server implementation — primary bootstrap |
| 3 | `src/gateway/server-http.ts` | HTTP request handler, route dispatch |
| 4 | `src/gateway/server-startup.ts` | Gateway startup sequence |
| 5 | `src/gateway/server-startup-config.ts` | Config loading at startup |
| 6 | `src/gateway/server-startup-plugins.ts` | Plugin bootstrap at startup |
| 7 | `src/gateway/server-runtime-services.ts` | Runtime services activation |
| 8 | `src/gateway/server-ws-runtime.ts` | WebSocket runtime attach |
| 9 | `src/gateway/server-channels.ts` | Channel manager |
| 10 | `src/gateway/server-cron.ts` | Gateway cron service |

## Auth & Security

| # | File | Purpose |
|---|------|---------|
| 11 | `src/gateway/auth.ts` | Gateway authentication logic |
| 12 | `src/gateway/startup-auth.ts` | Startup auth resolution |
| 13 | `src/gateway/credentials.ts` | Credential resolution |
| 14 | `src/gateway/auth-resolve.ts` | Auth mode resolution |
| 15 | `src/gateway/auth-rate-limit.ts` | Rate limiting |
| 16 | `src/gateway/auth-config-utils.ts` | Auth config utilities |
| 17 | `src/security/dm-policy-shared.ts` | DM / group access policy |
| 18 | `src/security/secret-equal.ts` | Constant-time secret comparison |
| 19 | `src/security/ssrf.ts` | SSRF protection |
| 20 | `src/gateway/known-weak-gateway-secrets.ts` | Weak secret detection |

## Config System

| # | File | Purpose |
|---|------|---------|
| 21 | `src/config/config.ts` | Config exports & main API |
| 22 | `src/config/io.ts` | Config file I/O, parsing, recovery |
| 23 | `src/config/validation.ts` | Config validation |
| 24 | `src/config/schema.base.generated.ts` | Auto-generated base JSON schema |
| 25 | `src/config/paths.ts` | Config path resolution |
| 26 | `src/config/runtime-overrides.ts` | Runtime config overrides |
| 27 | `src/config/env-vars.ts` | Environment variable injection |
| 28 | `src/config/env-substitution.ts` | `${VAR}` substitution in config |
| 29 | `src/config/mutate.ts` | Config mutation / write |
| 30 | `src/config/sessions.ts` | Session config resolution |

## Agents & AI Runtime

| # | File | Purpose |
|---|------|---------|
| 31 | `src/agents/agent-command.ts` | Main agent command execution |
| 32 | `src/agents/agent-scope.ts` | Agent scope resolution |
| 33 | `src/agents/agent-runtime-config.ts` | Agent runtime configuration |
| 34 | `src/agents/model-selection.ts` | Model selection logic |
| 35 | `src/agents/model-fallback.ts` | Provider fallback / rotation |
| 36 | `src/agents/openai-transport-stream.ts` | OpenAI streaming transport |
| 37 | `src/agents/openai-ws-stream.ts` | OpenAI WebSocket streaming |
| 38 | `src/agents/anthropic-transport-stream.ts` | Anthropic streaming |
| 39 | `src/agents/pi-tools.ts` | Core agent toolset |
| 40 | `src/agents/pi-embedded-runner/run/attempt.ts` | Embedded runner attempt |
| 41 | `src/agents/command/attempt-execution.runtime.ts` | Execution runtime |
| 42 | `src/agents/command/delivery.runtime.ts` | Delivery runtime |
| 43 | `src/agents/skills.ts` | Skills loading |
| 44 | `src/agents/sandbox.ts` | Sandbox orchestration |
| 45 | `src/agents/sandbox/backend.ts` | Sandbox backends |

## Channels

| # | File | Purpose |
|---|------|---------|
| 46 | `src/channels/plugins/index.ts` | Channel plugin registry |
| 47 | `src/channels/plugins/setup-wizard-helpers.ts` | Channel setup helpers |
| 48 | `src/channels/plugins/account-helpers.ts` | Channel account resolution |
| 49 | `src/channels/plugins/types.adapters.ts` | Channel type adapters |
| 50 | `src/channels/allow-from.ts` | Allowlist resolution |
| 51 | `src/channels/command-gating.ts` | Command gating |
| 52 | `src/channels/thread-bindings-policy.ts` | Thread binding policies |
| 53 | `extensions/whatsapp/src/channel.ts` | WhatsApp channel implementation |
| 54 | `extensions/telegram/src/channel.ts` | Telegram channel implementation |
| 55 | `extensions/discord/src/channel.ts` | Discord channel implementation |

## Plugin System

| # | File | Purpose |
|---|------|---------|
| 56 | `src/plugins/runtime/runtime-channel.ts` | Channel runtime loader |
| 57 | `src/plugins/runtime/runtime-registry-loader.ts` | Plugin registry loader |
| 58 | `src/plugins/runtime/runtime-tasks.ts` | Plugin task runtime |
| 59 | `src/plugins/loader.ts` | Plugin loader |
| 60 | `src/plugins/contracts/plugin-sdk-subpaths.ts` | Plugin SDK contract |
| 61 | `src/plugins/provider-runtime.ts` | Provider runtime |
| 62 | `src/plugins/bundled-runtime-deps-activity.ts` | Bundled dep management |
| 63 | `src/plugins/hook-runner-global.ts` | Global hook runner |
| 64 | `src/plugins/installed-plugin-index-records.ts` | Installed plugin index |

## Gateway Protocol & Methods

| # | File | Purpose |
|---|------|---------|
| 65 | `src/gateway/protocol/index.ts` | Gateway protocol exports |
| 66 | `src/gateway/server-methods-list.ts` | Available gateway methods |
| 67 | `src/gateway/server-methods/channels.ts` | Channel gateway methods |
| 68 | `src/gateway/server-methods/cron.ts` | Cron gateway methods |
| 69 | `src/gateway/server-methods/devices.ts` | Device gateway methods |
| 70 | `src/gateway/server-methods/models.ts` | Model gateway methods |
| 71 | `src/gateway/server-methods/sessions.ts` | Session gateway methods |
| 72 | `src/gateway/server-methods/tools.ts` | Tool gateway methods |
| 73 | `src/gateway/call.ts` | Gateway RPC call handler |
| 74 | `src/gateway/client.ts` | Gateway client |

## Cron & Tasks

| # | File | Purpose |
|---|------|---------|
| 75 | `src/cron/service/jobs.ts` | Cron job execution |
| 76 | `src/cron/service/timer.ts` | Cron timer |
| 77 | `src/cron/service/ops.ts` | Cron operations |
| 78 | `src/cron/isolated-agent/run.ts` | Isolated cron agent runner |
| 79 | `src/cron/types.ts` | Cron types |
| 80 | `src/tasks/task-registry.maintenance.ts` | Task registry maintenance |
| 81 | `src/tasks/runtime-internal.ts` | Task runtime internals |

## Storage & Media

| # | File | Purpose |
|---|------|---------|
| 82 | `src/media/mime.ts` | MIME type handling |
| 83 | `src/media/store.ts` | Media storage |
| 84 | `src/sessions/session-store.ts` | Session store |
| 85 | `src/tasks/task-registry.store.sqlite.ts` | SQLite task store |
| 86 | `src/proxy-capture/store.sqlite.ts` | SQLite proxy capture store |
| 87 | `src/infra/outbound/delivery-queue-storage.ts` | Delivery queue storage |

## CLI & Commands

| # | File | Purpose |
|---|------|---------|
| 88 | `src/cli/deps.ts` | CLI dependencies |
| 89 | `src/cli/run-main.ts` | Main CLI entry |
| 90 | `src/commands/gateway.ts` | Gateway command |
| 91 | `src/commands/doctor.ts` | Doctor command |
| 92 | `src/commands/onboard.ts` | Onboard command |
| 93 | `src/commands/agent.ts` | Agent command |
| 94 | `src/commands/config.ts` | Config command |

## Infrastructure

| # | File | Purpose |
|---|------|---------|
| 95 | `src/infra/env.ts` | Environment utilities |
| 96 | `src/infra/home-dir.ts` | Home directory resolution |
| 97 | `src/infra/path-env.ts` | PATH environment setup |
| 98 | `src/infra/restart.ts` | Process restart logic |
| 99 | `src/infra/system-events.ts` | System event queue |
| 100 | `src/logging/subsystem.ts` | Subsystem logger |

---

*Evidence from direct codebase inspection and cross-referencing import graphs.*
