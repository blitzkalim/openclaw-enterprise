# Queues

## Purpose
Find message queues, job queues, or task queues.

## Findings

### No Message Broker (Redis/RabbitMQ/BullMQ)

OpenClaw does not use Redis, RabbitMQ, BullMQ, or any external message broker.

### Internal Queues

1. **Auto-Reply Dispatch Queue**
   - File: `src/auto-reply/reply/dispatcher-registry.ts`
   - In-memory queue for inbound message dispatch
   - Deduplication by message hash
   - Queue drained asynchronously
   - No persistence — lost on process restart

2. **Process Command Queue**
   - File: `src/process/command-queue.ts`
   - Queues CLI-equivalent commands from channels
   - Serial execution to prevent race conditions
   - In-memory only

3. **Delivery Queue**
   - File: `src/infra/outbound/delivery-queue-storage.ts`
   - **Persisted** outbound message queue
   - SQLite-backed for crash recovery
   - Processed asynchronously
   - Retries with exponential backoff

4. **Subagent Queue**
   - File: `src/agents/subagent-announce-queue.ts`
   - Queues subagent spawn requests
   - Prevents thundering herd on burst requests
   - In-memory only

5. **Task Registry Queue**
   - File: `src/tasks/runtime-internal.ts`
   - Task lifecycle tracking
   - SQLite-backed for persistence
   - Not a traditional queue — more of a registry

### Queue Characteristics

| Queue | Persistent | Backpressure | Retry | Max Size |
|-------|-----------|-------------|-------|----------|
| Auto-Reply Dispatch | No | Drop (dedup) | No | Memory |
| Process Command | No | Block | No | Memory |
| Delivery | Yes (SQLite) | Delay | Yes (exp backoff) | Disk |
| Subagent | No | Drop | No | Memory |
| Task Registry | Yes (SQLite) | N/A | N/A | Disk |

### No Distributed Queue

- All queues are local to the gateway process
- No horizontal scaling via queue workers
- No priority queues (except implicit session priority)
- No dead letter queue

## Evidence
- `src/auto-reply/reply/dispatcher-registry.ts` — dispatch queue
- `src/process/command-queue.ts` — command queue
- `src/infra/outbound/delivery-queue-storage.ts` — delivery queue
- `src/agents/subagent-announce-queue.ts` — subagent queue
- `src/tasks/runtime-internal.ts` — task registry

## Notes
- Queue system is minimal — designed for single-process deployment
- Delivery queue is the only persistent queue (for message reliability)
- No queue monitoring or management UI
- Restarting gateway clears in-memory queues
