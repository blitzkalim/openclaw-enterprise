# Skills System

## Purpose
How skills are registered, loaded, and exposed to agents.

## Findings

### Skill Definition

Skills are declarative toolsets that extend agent capabilities:
- Defined in `skills/` directory or extension `skills/` subdirectory
- Declared as TypeScript files exporting skill manifests
- Loaded dynamically at agent runtime

### Skill Manifest Structure

```typescript
interface SkillManifest {
  id: string;
  name: string;
  description: string;
  tools: ToolDefinition[];
  config?: SkillConfigSchema;
}
```

### Skill Loading

1. **Discovery**
   - `src/agents/skills.ts` — `loadSkills()`
   - Scans: `skills/*/` (built-in), `extensions/*/skills/` (extension skills)
   - `src/agents/skills/filter.ts` — skill filtering by agent
   - `src/agents/skills/refresh-state.ts` — hot reload

2. **Registration**
   - Skills registered as tools in agent prompt
   - Tool schemas generated for LLM function calling
   - `src/agents/pi-tools.ts` — tool registry integration

3. **Execution**
   - LLM requests `tool_use` with skill tool name
   - `src/agents/command/attempt-execution.runtime.ts` — routes to skill handler
   - Skill handler executes and returns `tool_result`

### Built-in Skills Location

- `skills/` — top-level skills directory (~72 items)
- Examples: `1password/`, `apple-notes/`, `apple-reminders/`, `bear-notes/`
- Each skill has `SKILL.md` documentation and implementation

### Extension Skills

- Extensions can bundle skills in `extensions/<id>/skills/`
- Declared in extension `package.json` `openclaw.skills` block
- Loaded alongside extension runtime

### Skill Configuration

- Per-skill config in `openclaw.json` `skills.<skillId>`
- Skills can declare required config keys
- `openclaw doctor` validates skill config

### Skill Permissions

- `src/agents/sandbox/tool-policy.ts` — sandbox tool restrictions
- Skills running in sandbox have limited tool access
- Main session can use all skills by default
- `agents.defaults.skills` — global skill allowlist

## Evidence
- `src/agents/skills.ts` — skill loading
- `src/agents/skills/filter.ts` — skill filtering
- `src/agents/skills/refresh-state.ts` — hot reload
- `src/agents/pi-tools.ts` — tool registry
- `skills/*/SKILL.md` — skill documentation

## Notes
- Skills are in-process — no sandboxing at skill level
- Malicious skill code has same access as core
- Skill execution is synchronous (blocking) unless async
- Skill errors propagated to agent as tool_result with error
