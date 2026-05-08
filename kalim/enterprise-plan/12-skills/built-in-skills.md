# Built-in Skills

## Purpose
Catalog of all built-in skills found in the repository.

## Findings

### Skills Directory (`skills/`)

| Skill | Path | Purpose |
|-------|------|---------|
| 1Password | `skills/1password/` | Password manager integration |
| Apple Notes | `skills/apple-notes/` | macOS Notes app access |
| Apple Reminders | `skills/apple-reminders/` | macOS Reminders access |
| Bear Notes | `skills/bear-notes/` | Bear app integration |
| Calendar | `skills/calendar/` | Calendar event management |
| Contacts | `skills/contacts/` | Contact lookup |
| Drafts | `skills/drafts/` | Drafts app integration |
| Files | `skills/files/` | File system operations |
| Git | `skills/git/` | Git repository operations |
| GitHub | `skills/github/` | GitHub API integration |
| Home Assistant | `skills/home-assistant/` | Smart home control |
| Jira | `skills/jira/` | Jira issue management |
| Linear | `skills/linear/` | Linear project management |
| Mail | `skills/mail/` | Email reading/sending |
| Maps | `skills/maps/` | Location/directions |
| Messages | `skills/messages/` | Message sending |
| Music | `skills/music/` | Music control |
| Notes | `skills/notes/` | Generic notes |
| Photos | `skills/photos/` | Photo library access |
| Safari | `skills/safari/` | Browser integration |
| Shortcuts | `skills/shortcuts/` | Siri Shortcuts |
| Todoist | `skills/todoist/` | Todoist task management |
| Weather | `skills/weather/` | Weather lookup |
| Web Search | `skills/web-search/` | Web search via providers |
| Wikipedia | `skills/wikipedia/` | Wikipedia lookup |
| YouTube | `skills/youtube/` | YouTube search |
| Zoom | `skills/zoom/` | Zoom meeting management |

### Skill Implementation Pattern

Each skill typically contains:
- `SKILL.md` — documentation and tool definitions
- `index.ts` — implementation (if in-process)
- External tool integration via API calls

### Skill Tools Exposed to Agent

Examples from `skills/web-search/SKILL.md`:
- `web_search(query)` — search the web
- `web_fetch(url)` — fetch page content

Examples from `skills/files/SKILL.md`:
- `list_files(path)` — list directory
- `read_file(path)` — read file content
- `write_file(path, content)` — write file

### Extension Skills

Many extensions also provide skills:
- `extensions/browser/` — browser automation skill
- `extensions/memory-core/` — memory/retrieval skill
- `extensions/brave/` — Brave search skill
- `extensions/perplexity/` — Perplexity search skill

## Evidence
- `skills/` directory listing
- `skills/*/SKILL.md` — skill definitions
- `src/agents/skills.ts` — skill loader
- Extension `package.json` `openclaw.skills` blocks

## Notes
- Skills are documentation-first — `SKILL.md` defines tools
- Agent reads skill docs to learn tool usage
- Some skills require platform-specific setup (macOS apps)
- Skills can be disabled per-agent via config
