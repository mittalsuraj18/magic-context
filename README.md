# Magic Context

Intelligent context management for OpenCode. Magic Context gives your AI agent the tools to stay within token limits gracefully, without losing track of what matters.

---

## What it does

- **Tags every message and tool output** with `§N§` identifiers the agent can reference when reducing context
- **Defers context mutations** until cached prefixes are stale, so you don't pay to invalidate what you already cached
- **Summarizes session history** via an asynchronous historian agent that extracts facts, decisions, and structured compartments from older conversation history
- **Persists memory across sessions** using semantic + full-text search so facts, architecture decisions, and constraints survive conversation resets

---

## Installation

```sh
npm install @cortexkit/magic-context-opencode
```

Then add the plugin to your OpenCode config (`opencode.json` or `opencode.jsonc`):

```jsonc
{
  "plugins": ["@cortexkit/magic-context-opencode"]
}
```

---

## Quick Start

Create a `magic-context.jsonc` in your project root (or in `.opencode/magic-context.jsonc` for project-scoped config):

```jsonc
{
  "enabled": true,

  // Optional: configure which model historian uses
  "historian": {
    "model": "anthropic/claude-haiku-4",
    "fallback_models": ["anthropic/claude-3-5-haiku"]
  }
}
```

That's enough to get going. All other options have sensible defaults.

For user-wide settings, put the config at `~/.config/opencode/magic-context.jsonc`. Project config merges on top of user config.

> **Note:** Magic Context disables itself automatically if OpenCode's built-in auto-compaction is enabled for the project. The two features conflict — only one should run at a time.

---

## How It Works

### 1. Tagging

Every response causes all messages, file attachments, and tool outputs to get tagged with monotonically increasing `§N§` identifiers. The agent sees these tags inline and uses them to reference specific content when reducing.

Tags persist in the database. If you restart a session, previously assigned tags are restored from storage and tagging resumes from where it left off.

### 2. Queueing reduction operations

The agent calls `ctx_reduce` to request drops. These operations are **not applied immediately**. They go into a pending queue. This is intentional: mutating the conversation too early invalidates cached prefixes and wastes money. The system waits for the right moment.

If the agent targets still-protected recent tags, those drops stay queued as deferred intents until the tags age out of the protected tail.

### 3. Historian pipeline

When queued drops alone can't buy enough headroom, Magic Context starts the historian subagent on an older eligible prefix of raw session history. Historian produces:

- **compartments** — larger chronological blocks that replace older raw history
- **facts** — durable decisions, constraints, and preferences
- **session notes** — rewritten and deduplicated `ctx_note` content

That structured state is stored in the database and injected back into later transforms so the session retains important long-term context without replaying the full old transcript.

### 4. The scheduler

Two conditions trigger execution of pending operations:

- **Cache expired** — enough time has passed since the last response that the cached prefix is likely stale (default: 5 minutes)
- **Execute threshold** — context usage has reached `execute_threshold_percentage` (default: 65%). At that point, waiting risks running out of space, so queued drops apply immediately regardless of cache state

If neither condition is met, operations stay queued and the conversation continues unchanged. At higher emergency bands, the transform can also materialize finished historian output and force aggressive cleanup to protect the session.

### 5. Transform pipeline

On every message transform (before the conversation is sent to the model), the system:

1. Assigns new tags to messages that don't have them yet
2. Applies already-flushed operations
3. Checks whether the scheduler says it's time to flush pending operations
4. If yes, applies pending drops that are no longer protected and marks them applied
5. Injects stored historian state for older covered history
6. Starts or materializes historian work when sustained pressure shows local drops aren't enough
7. Injects nudge messages or sticky reminders when context usage is above threshold

### 6. Nudger

Magic Context uses rolling token-based nudges rather than fixed percentage bands. As usage approaches the configured execute threshold, reminder cadence tightens. Regular assistant nudges are throttled after a real `ctx_reduce` call, while the emergency nudge at 80% still fires even during cooldown.

There's also a sticky end-of-turn reminder for tool-heavy turns, so agents get one more chance to clean up fresh tool output before the next request grows the session further.

### 7. Compaction handling

When OpenCode compacts a session, all existing tags are marked as compacted, pending operations are cleared, and nudge counters reset. Magic Context then starts fresh for the post-compaction conversation.

---

## Cache Awareness

This is the central insight of the feature.

Anthropic (and other providers) cache conversation prefixes. When you send a request, a prefix of the conversation is cached server-side for a short window. If the same prefix arrives in the next request, the provider can reuse the cached computation instead of processing it again. That saves money and reduces latency.

If you mutate the conversation mid-window (by dropping or summarizing messages), you change the prefix, invalidate the cache, and throw away those savings. Magic Context avoids this by deferring mutations until the cache is stale.

The default `cache_ttl` of `"5m"` works well for most sessions. You can tune it:

```jsonc
{
  "enabled": true,
  "cache_ttl": "5m"
}
```

Per-model overrides:

```jsonc
{
  "enabled": true,
  "cache_ttl": {
    "default": "5m",
    "anthropic/claude-opus-4-5": "10m"
  }
}
```

Supported formats: `"5m"` (minutes), `"30s"` (seconds), `"1h"` (hours).

Higher-tier models with longer cache windows benefit from a longer TTL. Setting it too low wastes cache hits. Setting it too high delays reduction on long sessions.

---

## Configuration Reference

All settings are flat top-level keys in `magic-context.jsonc`. There is no nesting under `magic_context` or similar.

### Core options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Master toggle. Must be `true` to activate. |
| `cache_ttl` | `string` or `object` | `"5m"` | Wait time after a response before applying pending ops. String or per-model object. |
| `protected_tags` | `number` (1-20) | `5` | Last N active tags immune from immediate dropping. |
| `nudge_interval_tokens` | `number` | `10000` | Minimum token growth between low-priority rolling nudges. |
| `execute_threshold_percentage` | `number` (35-95) or `object` | `65` | Context percentage that forces queued ops to execute. Supports per-model object. |
| `auto_drop_tool_age` | `number` | `100` | Auto-drop tool outputs older than N tags during queue execution. |
| `clear_reasoning_age` | `number` | `50` | Clear reasoning/thinking blocks older than N tags. |
| `iteration_nudge_threshold` | `number` | `15` | Consecutive assistant messages without user input before an iteration nudge fires. |
| `compartment_token_budget` | `number` | `20000` | Token budget used when building historian input chunks. |
| `historian_timeout_ms` | `number` | `300000` | Timeout per historian prompt call in milliseconds. |

### `historian`

Configures the historian subagent. Optional — the plugin has a built-in default chain.

```jsonc
{
  "historian": {
    "model": "anthropic/claude-haiku-4",
    "fallback_models": ["anthropic/claude-3-5-haiku"],
    "temperature": 0.1,
    "maxTokens": 4096
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `model` | `string` | Primary model for historian runs. |
| `fallback_models` | `string` or `string[]` | Models to try if the primary is rate-limited or fails. |
| `temperature` | `number` (0-2) | Sampling temperature. |
| `maxTokens` | `number` | Max tokens per historian response. |
| `variant` | `string` | Agent variant to use. |
| `prompt` | `string` | Custom system prompt override. |

### `embedding`

Controls how memories are embedded for semantic search.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `provider` | `"local"` \| `"openai-compatible"` \| `"off"` | `"local"` | Embedding backend. `"local"` runs `Xenova/all-MiniLM-L6-v2` in-process via HuggingFace Transformers.js. |
| `model` | `string` | `"Xenova/all-MiniLM-L6-v2"` | Model to use. Only relevant for `"local"` and `"openai-compatible"`. |
| `endpoint` | `string` | | Required when `provider` is `"openai-compatible"`. OpenAI-compatible embeddings endpoint. |
| `api_key` | `string` | | Optional API key for `"openai-compatible"`. |

Example using an external embedding service:

```jsonc
{
  "embedding": {
    "provider": "openai-compatible",
    "model": "text-embedding-3-small",
    "endpoint": "https://api.openai.com/v1",
    "api_key": "sk-..."
  }
}
```

### `memory`

Cross-session memory settings. Memories persist across conversations and are injected at session start.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable cross-session memory. |
| `injection_budget_tokens` | `number` (500-20000) | `4000` | Token budget for memory injection at session start. |
| `auto_promote` | `boolean` | `true` | Automatically promote eligible session facts to memory. |
| `retrieval_count_promotion_threshold` | `number` | `3` | How many times a memory must be retrieved before auto-promotion to permanent status. |

### `sidekick`

An optional lightweight local agent that retrieves relevant memories at session start. Runs against a local LLM endpoint. Disabled by default.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable sidekick. |
| `endpoint` | `string` | `"http://localhost:1234/v1"` | OpenAI-compatible endpoint for the sidekick model. |
| `model` | `string` | `"qwen3.5-9b"` | Model to use for sidekick queries. |
| `api_key` | `string` | `""` | API key if the endpoint requires one. |
| `max_tool_calls` | `number` | `3` | Maximum tool calls the sidekick can make per retrieval run. |
| `timeout_ms` | `number` | `30000` | Timeout per sidekick run in milliseconds. |
| `system_prompt` | `string` | | Optional custom system prompt override. |

### `dreaming`

Background memory maintenance tasks that run on a schedule (typically overnight). Requires a local LLM endpoint.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable dreaming. |
| `schedule` | `string` | `"02:00-06:00"` | Time window for dreaming runs (24h format). |
| `max_runtime_minutes` | `number` | `120` | Maximum total runtime per dreaming session. |
| `endpoint` | `string` | `"http://localhost:1234/v1"` | OpenAI-compatible endpoint for the dreaming model. |
| `model` | `string` | `"qwen3.5-32b"` | Model to use during dreaming. |
| `api_key` | `string` | `""` | API key if the endpoint requires one. |
| `tasks` | `array` | `["decay", "consolidate"]` | Which tasks to run. Options: `"decay"`, `"consolidate"`, `"mine"`, `"verify"`, `"git"`, `"map"`. |

Full example config:

```jsonc
{
  "enabled": true,
  "cache_ttl": "5m",
  "protected_tags": 5,
  "execute_threshold_percentage": 65,
  "auto_drop_tool_age": 100,
  "clear_reasoning_age": 50,

  "historian": {
    "model": "anthropic/claude-haiku-4",
    "fallback_models": ["anthropic/claude-3-5-haiku"]
  },

  "embedding": {
    "provider": "local"
  },

  "memory": {
    "enabled": true,
    "injection_budget_tokens": 4000,
    "auto_promote": true
  },

  "dreaming": {
    "enabled": false,
    "schedule": "02:00-06:00",
    "model": "qwen3.5-32b",
    "tasks": ["decay", "consolidate"]
  }
}
```

---

## Tools

Magic Context exposes four tools to the agent.

### `ctx_reduce`

Queues drop operations on tagged content. Drops are applied at the optimal time (when the cache is stale or threshold is hit), not immediately.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `drop` | `string` | Yes | Tag IDs to remove entirely. Accepts range syntax. |

**Range syntax:**

| Format | Example | Meaning |
|--------|---------|---------|
| Single | `"5"` | Tag 5 only |
| List | `"1,2,9"` | Tags 1, 2, and 9 |
| Range | `"3-5"` | Tags 3, 4, and 5 |
| Mixed | `"1-5,8"` | Tags 1 through 5, plus 8 |

The last N active tags (default: 5) are protected from immediate execution. If you target them, the drop stays queued until they age out of the protected tail.

```
ctx_reduce(drop="1-10,15")
```

### `ctx_note`

Saves or inspects durable session notes. Historian reads these notes, deduplicates them, and rewrites them over time. Use this for goals, constraints, decisions, and workflow reminders you want to survive context squashing.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | `"write"` \| `"read"` \| `"clear"` | Defaults to `"write"` when content is provided, otherwise `"read"`. |
| `content` | `string` | Note text. Required when action is `"write"`. |

```
ctx_note(action="write", content="Use the feat->integrate cherry-pick flow for all magic-context work.")
```

### `ctx_recall`

Searches cross-session project memories using natural language. Returns results ranked by a combination of semantic similarity and full-text search (70/30 weighted blend when both sources are available).

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | `string` | Yes | Natural language search query. |
| `category` | `string` | No | Filter results to a specific category. |
| `limit` | `number` | No | Max results to return (default: 10). |

```
ctx_recall(query="authentication approach", category="ARCHITECTURE_DECISIONS")
```

### `ctx_memory`

Manages cross-session project memories. Memories persist across sessions and are automatically injected at session start.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `"write"` \| `"delete"` \| `"promote"` \| `"list"` | Yes | Action to perform. |
| `content` | `string` | For write | Memory content. |
| `category` | `string` | For write | Memory category. |
| `id` | `number` | For delete/promote | Memory ID from a previous `list`. |
| `scope` | `"project"` \| `"global"` | No | `"project"` scopes to the current project (default). `"global"` is available across all projects. |

```
ctx_memory(action="write", category="ARCHITECTURE_DECISIONS", content="We use event sourcing for the orders domain.")
ctx_memory(action="list")
ctx_memory(action="promote", id=42)
```

---

## Commands

### `/ctx-status`

Shows debug information about the current session:

- Total tag count and next tag index
- Pending drop queue and protected-tail deferrals
- Cache TTL remaining until next scheduled flush
- Nudge state and current context usage percentage
- Historian progress, compartment coverage, and failure info
- Last transform error (if any)

Run this when drops seem stuck or historian work isn't progressing.

### `/ctx-flush`

Forces queued drops and cleanup to apply immediately, bypassing the scheduler's cache TTL check.

Use this when you want cleanup to happen right now regardless of cache state. After flushing, the command reports what was released, skipped, or still deferred because it remains protected.

### `/ctx-recomp`

Rebuilds compartments, facts, and maintained notes from raw session history in memory, then publishes the rebuilt state atomically if validation succeeds.

Use this when stored historian state seems stale or structurally wrong and you want a manual rebuild from source history.

---

## Storage

Magic Context stores all state in a local SQLite database:

```
~/.local/share/opencode/storage/plugin/magic-context/context.db
```

If that database can't be created or opened, Magic Context disables itself and warns the user. It does **not** fall back to in-memory state. This fail-closed behavior prevents resumed sessions from unexpectedly replaying an oversized raw transcript.

The database runs in WAL (write-ahead log) journal mode for safe concurrent access.

| Table | Contents |
|-------|----------|
| `tags` | Tag assignments: message ID, tag number, session ID, status |
| `pending_ops` | Queued drop operations with status tracking |
| `source_contents` | Raw content snapshots used during reduction |
| `compartments` | Historian-produced structured history blocks |
| `session_facts` | Durable categorized facts preserved across squashes |
| `session_notes` | Maintained session-scoped notes from `ctx_note` |
| `session_meta` | Per-session state: context percentage, last response time, nudge flags |

---

## Development

### Prerequisites

- [Bun](https://bun.sh) 1.x

### Scripts

```sh
# Build the plugin
bun run build

# Type-check without emitting
bun run typecheck

# Run tests
bun test

# Lint
bun run lint

# Lint and auto-fix
bun run lint:fix

# Format
bun run format
```

### Utility scripts

```sh
# Tail the plugin's structured log output
bun scripts/tail-view.ts

# Dump the contents of the context database for a session
bun scripts/context-dump.ts

# Trigger a dreaming run manually (outside the schedule window)
bun scripts/dream.ts

# Backfill embeddings for existing memories that don't have them yet
bun scripts/backfill-embeddings.ts
```

### Tips

**Keep historian fast.** Historian runs asynchronously but a slow model still delays when older history gets squashed into compartments. A lightweight primary model with a short fallback chain is the best tradeoff.

**Drop tool outputs aggressively.** Tool outputs (bash results, grep output, file reads) are typically the largest context consumers and can't be summarized. Once you've acted on them, they're safe to drop.

**Use `ctx_note` for durable guidance.** Put stable goals, constraints, preferences, and workflow rules into `ctx_note` instead of relying on them to survive in raw conversation history.

**Check `/ctx-status` before debugging.** If drops aren't releasing or historian looks stuck, the status view shows pending ops, protected-tail state, historian progress, and the last transform error.

**Configure `historian.fallback_models` for long sessions.** If your primary historian model gets rate-limited, a fallback keeps summaries generating without interruption.

---

## License

SUL-1.0 — see [LICENSE](./LICENSE) for details.
