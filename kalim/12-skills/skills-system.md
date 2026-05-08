# Skills System

## Overview

Skills are **reusable capability definitions** that extend what the agent can do. They define patterns, prompts, and workflows for specific domains (coding, research, creative writing, etc.).

## Skill Architecture

```
Skill Definition (skills/ or extension)
  |
  +-- Name & Description
  +-- System Prompt Override
  +-- Tool Preferences
  +-- Conversation Starters
  +-- Constraints & Guidelines
  |
  v
Agent Runtime
  |
  +-- Load active skills from config
  +-- Merge skill prompts into system prompt
  +-- Restrict available tools to skill subset
  +-- Apply skill-specific parameters
  |
  v
LLM Call with skill-augmented context
```

## Skill Definition Format

From `skills/` directory (inferred):

```typescript
type SkillDefinition = {
  id: string;                   // Unique identifier
  name: string;                 // Human-readable name
  description: string;          // What the skill does
  version: string;              // Semver

  // Prompt engineering
  systemPrompt?: string;        // Overrides or extends system prompt
  userPromptPrefix?: string;   // Prepended to user messages
  assistantStyle?: string;      // Describes desired response style

  // Capabilities
  tools?: string[];             // Subset of available tools to enable
  providers?: string[];         // Preferred providers
  models?: string[];            // Preferred models

  // Constraints
  maxIterations?: number;       // Override default max tool iterations
  sandboxRequired?: boolean;    // Require sandbox for this skill
  approvalRequired?: boolean;   // Require approval for all tool calls

  // Starters
  conversationStarters?: string[];  // Suggested first messages

  // Metadata
  author?: string;
  tags?: string[];
  icon?: string;
};
```

## Skill Storage Locations

| Location | Purpose |
|----------|---------|
| `skills/` (root) | Built-in skills shipped with OpenClaw |
| `~/.openclaw/skills/` | User-installed skills |
| `extensions/*/skills/` | Extension-provided skills |

## Built-in Skills (from `skills/` directory)

| Skill | Description | Tools |
|-------|-------------|-------|
| `general` | General-purpose assistant | All |
| `coding` | Software development | code_execute, file_read, file_write, browser_navigate |
| `research` | Deep research tasks | web_search, browser_navigate, memory_search |
| `creative` | Creative writing | image_generate, tts_speak |
| `data` | Data analysis | code_execute, file_read, web_search |
| `browser` | Web browsing tasks | browser_navigate, browser_screenshot, browser_click |
| `voice` | Voice conversations | stt_transcribe, tts_speak |
| `memory` | Memory management | memory_search, memory_add |
| `system` | System administration | code_execute, file_read, file_write |

## Skill Activation

```json
{
  "agents": {
    "defaults": {
      "skills": ["general", "coding"]
    }
  },
  "skills": {
    "enabled": ["general", "coding", "research"],
    "autoDiscover": true,
    "directories": [
      "./skills",
      "~/.openclaw/skills"
    ]
  }
}
```

Skill activation methods:
1. **Config default** — All sessions use configured skills
2. **Per-session** — User can switch skills mid-conversation
3. **Per-message** — Skill inferred from message content (e.g., "code this" → coding skill)
4. **Command** — `/skill coding` to switch

## Skill Prompt Merging

```typescript
function buildSystemPrompt(basePrompt: string, skills: SkillDefinition[]): string {
  const skillPrompts = skills
    .filter(s => s.systemPrompt)
    .map(s => `[${s.name}]: ${s.systemPrompt}`);

  return [
    basePrompt,
    ...skillPrompts,
    "Use the appropriate tools and style based on the active skills."
  ].join("\n\n");
}
```

## Skill Tool Filtering

```typescript
function filterToolsForSkills(allTools: Tool[], skills: SkillDefinition[]): Tool[] {
  const allowedTools = new Set(
    skills.flatMap(s => s.tools ?? allTools.map(t => t.name))
  );
  return allTools.filter(t => allowedTools.has(t.name));
}
```

Example: `coding` skill enables `code_execute`, `file_read`, `file_write`, `browser_navigate` but disables `image_generate`, `tts_speak`.

## Dynamic Skill Selection

The agent runtime may automatically select skills based on message content:

```typescript
function inferSkillsFromMessage(message: string): string[] {
  const keywords = {
    coding: ["code", "program", "debug", "function", "class", "bug"],
    research: ["search", "find", "research", "investigate", "look up"],
    creative: ["write", "story", "poem", "creative", "imagine"],
    browser: ["website", "browse", "open", "click", "page"],
    data: ["analyze", "data", "csv", "chart", "statistics"],
  };

  const inferred = [];
  for (const [skill, words] of Object.entries(keywords)) {
    if (words.some(w => message.toLowerCase().includes(w))) {
      inferred.push(skill);
    }
  }
  return inferred;
}
```

## Skill Marketplace (Inferred)

OpenClaw may support a skill marketplace:
```
openclaw skill install <skill-name>
openclaw skill list
openclaw skill update <skill-name>
openclaw skill remove <skill-name>
```

Not directly observed but consistent with plugin architecture.

## Skill Versioning

```typescript
// Semantic versioning for skills
// v1.0.0 → v1.1.0: Backward compatible (new prompts)
// v1.0.0 → v2.0.0: Breaking change (tool set changed)

// Agent runtime checks skill compatibility
function checkSkillCompatibility(skill: SkillDefinition, runtimeVersion: string): boolean {
  // Check minimum OpenClaw version requirement
  // Check tool availability
  // Check provider availability
  return true; // or throw incompatibility error
}
```

## Key Files

- `skills/` — Built-in skill definitions
- `src/agents/skills/` — Skill runtime loading and merging
- `src/config/config.ts` — Skill config schema
- `src/agents/runtime/` — Skill application in agent runtime

---

*Evidence: `skills/` directory listing, `src/agents/skills/` directory, `src/config/config.ts` skill config, agent architecture inference.*
