# Oh-My-Pi Magic Context Configuration Guide

This document explains every setting in `magic-context.jsonc` for oh-my-pi (`omp`) users.

## Where to Put Config

**User-level** (applies to all projects):
```
~/.omp/agent/magic-context.jsonc
```

**Project-level** (overrides user-level for specific projects):
```
<project>/.omp/magic-context.jsonc
```

Both use JSONC format (JSON with comments).

---

## Top-Level Settings

### `enabled`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Master switch for the entire plugin. When `false`, Magic Context registers nothing — no tools, no transforms, no historian, no memory. Use this to completely disable the plugin without uninstalling it.

### `ctx_reduce_enabled`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Controls the manual context-reduction pipeline.
  - When `true`: `ctx_reduce` tool is registered, `§N§` tag prefixes are injected into messages, and nudges remind the agent to reduce context.
  - When `false`: The `ctx_reduce` tool is hidden, nudges are disabled, and `§N§` prefixes are not injected. However, **automatic features still work**: historian compartments, heuristic cleanup, memory injection, and dreamer tasks continue to operate.
  - Use `false` if you want a fully automatic pipeline without agent intervention.

### `protected_tags`
- **Type:** `number` (1-100)
- **Default:** `20`
- **Description:** Number of most recent message tags that are protected from dropping. The agent can still manually `ctx_reduce` them, but automatic heuristic cleanup won't touch them. Increase this if the agent frequently references older context. Decrease if context grows too fast.

---

## Memory Settings

### `memory.enabled`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Enables the memory system. When `true`, `ctx_memory`, `ctx_search`, `ctx_note`, and `ctx_expand` tools are registered. Memories are stored in a shared SQLite database (`~/.local/share/cortexkit/magic-context/context.db`) and are visible across all harnesses (OpenCode, Pi, oh-my-pi).

### `memory.injection_budget_tokens`
- **Type:** `number` (500-20000)
- **Default:** `4000`
- **Description:** Maximum tokens injected into the `<session-history>` block at session start. This controls how much memory text appears in the system prompt. Increase for memory-heavy projects; decrease if the system prompt is too long.

### `memory.auto_promote`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** When `true`, the dreamer automatically promotes recurring session observations into stable memories. Requires `dreamer.enabled: true` for the promotion to actually happen.

### `memory.retrieval_count_promotion_threshold`
- **Type:** `number` (1+)
- **Default:** `3`
- **Description:** How many times a memory must be retrieved by `ctx_search` before it's considered "permanent" and immune from automatic archiving. Higher values = memories stay provisional longer.

---

## Historian Settings

### `historian.model`
- **Type:** `string`
- **Default:** *(none — historian disabled if not set)*
- **Description:** The model used for historian subagent calls. Examples: `anthropic/claude-haiku-4-5`, `anthropic/claude-sonnet-4`. If unset, the historian feature is completely disabled. The historian compacts long sessions into compartment summaries.

### `historian.fallback_models`
- **Type:** `string` or `string[]`
- **Default:** *(none)*
- **Description:** Fallback model(s) if the primary `historian.model` fails (rate limit, auth error, etc.). The subagent runner tries each in order.

### `historian.two_pass`
- **Type:** `boolean`
- **Default:** `false`
- **Description:** When `true`, runs a second editor pass after the initial historian pass to clean low-signal user lines and cross-compartment duplicates. Adds ~1 extra API call and ~30% more cost. Useful for models without extended thinking support.

### `historian.thinking_level`
- **Type:** `"off" | "minimal" | "low" | "medium" | "high" | "xhigh"`
- **Default:** *(none — uses Pi default)*
- **Description:** Pi-only setting. Controls the `--thinking` flag passed to historian subagent invocations. Required for providers like GitHub Copilot where default thinking levels may be rejected.

### `historian_timeout_ms`
- **Type:** `number` (60000+)
- **Default:** `300000` (5 minutes)
- **Description:** Maximum milliseconds for a single historian API call. Increase if historian frequently times out on large sessions.

---

## Dreamer Settings

### `dreamer.enabled`
- **Type:** `boolean`
- **Default:** `false`
- **Description:** Enables the scheduled dreamer. The dreamer runs background tasks (consolidating memories, verifying facts, archiving stale data, improving docs) during off-hours. Requires `true` for `memory.auto_promote` and `pin_key_files` to work.

### `dreamer.schedule`
- **Type:** `string`
- **Default:** `"02:00-06:00"`
- **Description:** Time window for dreaming. Format: `"HH:MM-HH:MM"` (24-hour). The dreamer only runs within this window. Set to a time when you're not actively coding.

### `dreamer.max_runtime_minutes`
- **Type:** `number` (10+)
- **Default:** `120`
- **Description:** Maximum minutes per dream session. The dreamer stops after this duration even if not all tasks are complete.

### `dreamer.tasks`
- **Type:** `string[]`
- **Default:** `["consolidate", "verify", "archive-stale", "improve"]`
- **Description:** Ordered list of tasks to run. Available tasks:
  - `"consolidate"` — Merge duplicate or near-duplicate memories
  - `"verify"` — Check if memories are still accurate against current code
  - `"archive-stale"` — Move outdated memories to archived status
  - `"improve"` — Refine memory wording for clarity
  - `"maintain-docs"` — Update `ARCHITECTURE.md` and `STRUCTURE.md`

### `dreamer.task_timeout_minutes`
- **Type:** `number` (5+)
- **Default:** `20`
- **Description:** Minutes allocated per task before moving to the next one.

### `dreamer.inject_docs`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** When `true`, generated `ARCHITECTURE.md` and `STRUCTURE.md` files are injected into the system prompt as `<project-docs>`. This gives the agent project context without re-reading files.

### `dreamer.user_memories`
- **Type:** `object`
- **Description:** Controls the user memory pipeline.

#### `dreamer.user_memories.enabled`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Enables extraction of behavioral observations from historian output. The dreamer reviews recurring patterns and promotes them to stable user memories injected as `<user-profile>`.

#### `dreamer.user_memories.promotion_threshold`
- **Type:** `number` (2-20)
- **Default:** `3`
- **Description:** Minimum candidate observations before the dreamer considers promoting them to a stable memory.

### `dreamer.pin_key_files`
- **Type:** `object`
- **Description:** Pins frequently-read files into the system prompt.

#### `dreamer.pin_key_files.enabled`
- **Type:** `boolean`
- **Default:** `false`
- **Description:** When `true`, the dreamer identifies files the agent reads frequently and pins their contents into `<key-files>` in the system prompt. This reduces re-reads after context drops.

#### `dreamer.pin_key_files.token_budget`
- **Type:** `number` (2000-30000)
- **Default:** `10000`
- **Description:** Total token budget for all pinned key files.

#### `dreamer.pin_key_files.min_reads`
- **Type:** `number` (2-20)
- **Default:** `4`
- **Description:** How many times a file must be fully read before it's considered for pinning.

---

## Embedding Settings

### `embedding.provider`
- **Type:** `"local" | "openai-compatible" | "off"`
- **Default:** `"local"`
- **Description:** Embedding provider for semantic memory search.
  - `"local"` — Uses a local ONNX model (default: `Xenova/all-MiniLM-L6-v2`). Runs entirely offline.
  - `"openai-compatible"` — Uses an external API (OpenAI, local inference server, etc.). Requires `endpoint` and `model`.
  - `"off"` — Disables semantic search. Only FTS (full-text search) is used.

### `embedding.model`
- **Type:** `string`
- **Default:** `"Xenova/all-MiniLM-L6-v2"` (local) or required (openai-compatible)
- **Description:** The embedding model ID. For local provider, any Hugging Face model name supported by the ONNX runtime. For openai-compatible, the model name expected by the API.

### `embedding.endpoint`
- **Type:** `string`
- **Default:** *(none)*
- **Description:** Required when `provider: "openai-compatible"`. The API endpoint URL (e.g., `https://api.openai.com/v1`).

### `embedding.api_key`
- **Type:** `string`
- **Default:** *(none)*
- **Description:** API key for openai-compatible provider. Optional if the endpoint doesn't require authentication.

---

## Sidekick Settings

### `sidekick.enabled`
- **Type:** `boolean`
- **Default:** `false`
- **Description:** Enables the sidekick augmentation feature. When `true`, the `/ctx-aug` command triggers a sidekick subagent that enriches the current prompt with additional context from memories and project docs.

### `sidekick.model`
- **Type:** `string`
- **Default:** *(none)*
- **Description:** Model for sidekick subagent calls. Required if `enabled: true`.

### `sidekick.system_prompt`
- **Type:** `string`
- **Default:** *(none)*
- **Description:** Custom system prompt override for the sidekick subagent.

### `sidekick.timeout_ms`
- **Type:** `number`
- **Default:** `30000`
- **Description:** Maximum milliseconds for a sidekick call.

### `sidekick.thinking_level`
- **Type:** `"off" | "minimal" | "low" | "medium" | "high" | "xhigh"`
- **Default:** *(none)*
- **Description:** Pi-only thinking level for sidekick subagent.

---

## Threshold & Scheduling Settings

### `execute_threshold_percentage`
- **Type:** `number` (20-80) or per-model object
- **Default:** `65`
- **Description:** Context usage percentage that triggers the execution of queued operations (drops, heuristic cleanup, etc.). When input tokens exceed this percentage of the model's context window, the runtime applies all pending reductions in one pass.
  - Can be per-model: `{ "default": 65, "anthropic/claude-haiku-4-5": 55 }`

### `execute_threshold_tokens`
- **Type:** `object`
- **Default:** *(none)*
- **Description:** Absolute token thresholds that override `execute_threshold_percentage` for specific models. Use this for hard caps.
  - Example: `{ "default": 50000, "anthropic/claude-sonnet-4": 80000 }`
  - Values above 80% of the model's context limit are clamped with a warning.

### `history_budget_percentage`
- **Type:** `number` (0.05-0.5)
- **Default:** `0.15` (15%)
- **Description:** Fraction of the usable context reserved for the `<session-history>` injection block. When the rendered history exceeds this budget, the compressor merges older compartments.

### `nudge_interval_tokens`
- **Type:** `number` (1000+)
- **Default:** `10000`
- **Description:** Minimum token growth between low-priority "rolling nudges" (gentle reminders to the agent that context is growing). These nudges appear in the system prompt and suggest using `ctx_reduce`.

### `iteration_nudge_threshold`
- **Type:** `number` (5+)
- **Default:** `15`
- **Description:** Number of consecutive assistant messages without user input before the runtime injects a stronger nudge. This catches agent loops that are spinning without making progress.

---

## Heuristic Cleanup Settings

### `auto_drop_tool_age`
- **Type:** `number` (10+)
- **Default:** `100`
- **Description:** During execute-pass heuristic cleanup, automatically drop tool outputs older than this many tags. Tool outputs are the bulkiest parts of context; dropping them early yields the biggest savings.

### `drop_tool_structure`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** When `true`, dropped tool parts are fully removed from the message instead of being truncated in place. This creates cleaner context but loses the "truncated §N§" markers.

### `clear_reasoning_age`
- **Type:** `number` (10+)
- **Default:** `50`
- **Description:** Clear reasoning/thinking blocks from messages older than this many tags. Reasoning blocks can be very long; clearing them recovers significant tokens.

---

## Compressor Settings

### `compressor.enabled`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Enables the background compressor. When the rendered `<session-history>` block exceeds its token budget, the compressor merges adjacent compartments and applies progressively aggressive compression at deeper depths.

### `compressor.min_compartment_ratio`
- **Type:** `number` (100-10000)
- **Default:** `1000`
- **Description:** Floor for compartment count. The compressor never reduces below `ceil(total_raw_messages / min_compartment_ratio)`. Lower ratio = more compartments preserved. Prevents runaway merging into a single mega-compartment.

### `compressor.max_merge_depth`
- **Type:** `number` (1-5)
- **Default:** `5`
- **Description:** Maximum compression depth. Depths 1-4 apply caveman-lite/full/ultra compression. Depth 5 collapses compartments to title-only (content recoverable via `ctx_expand`).

### `compressor.cooldown_ms`
- **Type:** `number` (60000+)
- **Default:** `600000` (10 minutes)
- **Description:** Minimum milliseconds between compressor runs for the same session. Prevents thrashing.

### `compressor.max_compartments_per_pass`
- **Type:** `number` (3-50)
- **Default:** `15`
- **Description:** Maximum compartments sent to one LLM call in a single pass. Keeping this low avoids LLM quality degradation on large inputs.

### `compressor.grace_compartments`
- **Type:** `number` (0-100)
- **Default:** `10`
- **Description:** Number of newest compartments always excluded from compression. Protects freshly-published historian output from being re-compressed before the agent has used it.

---

## Experimental Features

### `experimental.temporal_awareness`
- **Type:** `boolean`
- **Default:** `false`
- **Description:** Injects wall-clock gap markers (`<!-- +15m -->`) between user messages where more than 5 minutes elapsed, and adds date ranges on compartments. Gives the agent a sense of session pacing across multi-day sessions.

### `experimental.git_commit_indexing`
- **Type:** `object`
- **Description:** Indexes git commit messages into `ctx_search`.

#### `experimental.git_commit_indexing.enabled`
- **Type:** `boolean`
- **Default:** `false`
- **Description:** When `true`, commit messages become a searchable source. The agent can recall recent decisions, fixes, and regressions without running `git log`.

#### `experimental.git_commit_indexing.since_days`
- **Type:** `number` (7-3650)
- **Default:** `365`
- **Description:** Days of HEAD history to index.

#### `experimental.git_commit_indexing.max_commits`
- **Type:** `number` (100-20000)
- **Default:** `2000`
- **Description:** Maximum commits kept per project. Oldest are evicted.

### `experimental.auto_search`
- **Type:** `object`
- **Description:** Auto-search hint injection.

#### `experimental.auto_search.enabled`
- **Type:** `boolean`
- **Default:** `false`
- **Description:** When `true`, runs `ctx_search` on each new user message. If the top hit exceeds the score threshold, appends a compact hint block to that user message suggesting relevant context exists. Does NOT inject full content.

#### `experimental.auto_search.score_threshold`
- **Type:** `number` (0.3-0.95)
- **Default:** `0.60`
- **Description:** Minimum similarity score for the hint to fire.

#### `experimental.auto_search.min_prompt_chars`
- **Type:** `number` (5-500)
- **Default:** `20`
- **Description:** Skip auto-search when the user message is shorter than this.

### `experimental.caveman_text_compression`
- **Type:** `object`
- **Description:** Age-tier text compression. **Only active when `ctx_reduce_enabled: false`**. Buckets eligible messages into four age tiers and rewrites them with progressively aggressive compression.

#### `experimental.caveman_text_compression.enabled`
- **Type:** `boolean`
- **Default:** `false`
- **Description:** Enables automatic text compression on the oldest messages.

#### `experimental.caveman_text_compression.min_chars`
- **Type:** `number` (100-10000)
- **Default:** `500`
- **Description:** Text parts shorter than this (in characters) are left untouched.

---

## System Prompt Injection

### `system_prompt_injection.enabled`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Global escape hatch for system prompt augmentation. When `false`, NO Magic Context injection happens for ANY agent — no guidance block, no `<project-docs>`, no `<user-profile>`, no `<key-files>`.

### `system_prompt_injection.skip_signatures`
- **Type:** `string[]`
- **Default:** `["<!-- magic-context: skip -->"]`
- **Description:** If an agent's system prompt contains any of these substrings, Magic Context skips ALL injection for that call. Add custom markers to opt specific agents out. The default marker `<!-- magic-context: skip -->` can be added to custom agent prompts.

---

## Commit Cluster Trigger

### `commit_cluster_trigger.enabled`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Enables historian triggering based on git commit clusters. When enough commits accumulate in the unsummarized tail, the historian fires to compact them.

### `commit_cluster_trigger.min_clusters`
- **Type:** `number` (1+)
- **Default:** `3`
- **Description:** Minimum commit clusters required to trigger historian. Lower = more frequent historian runs.

---

## Cache TTL

### `cache_ttl`
- **Type:** `string` or per-model object
- **Default:** `"5m"`
- **Description:** Provider prompt cache TTL. Format: `"<number><unit>"` where unit is `s`, `m`, `h`, or `d`. Controls how long the runtime avoids cache-busting system prompt mutations.
  - Can be per-model: `{ "default": "5m", "anthropic/claude-sonnet-4": "10m" }`

---

## Full Example Configuration

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/cortexkit/magic-context/master/assets/magic-context.schema.json",
  "enabled": true,
  "ctx_reduce_enabled": true,
  
  // Memory
  "memory": {
    "enabled": true,
    "injection_budget_tokens": 8000,
    "auto_promote": true,
    "retrieval_count_promotion_threshold": 3
  },
  
  // Embedding (local = offline, no API calls)
  "embedding": {
    "provider": "local",
    "model": "Xenova/all-MiniLM-L6-v2"
  },
  
  // Historian (compacts long sessions)
  "historian": {
    "model": "anthropic/claude-haiku-4-5",
    "fallback_models": ["anthropic/claude-sonnet-4"],
    "two_pass": false,
    "thinking_level": "low"
  },
  
  // Dreamer (background tasks, auto-promotion)
  "dreamer": {
    "enabled": true,
    "schedule": "02:00-06:00",
    "model": "anthropic/claude-haiku-4-5",
    "tasks": ["consolidate", "verify", "archive-stale", "improve", "maintain-docs"],
    "inject_docs": true,
    "user_memories": {
      "enabled": true,
      "promotion_threshold": 3
    },
    "pin_key_files": {
      "enabled": true,
      "token_budget": 10000,
      "min_reads": 4
    }
  },
  
  // Sidekick (/ctx-aug command)
  "sidekick": {
    "enabled": true,
    "model": "anthropic/claude-haiku-4-5",
    "timeout_ms": 30000
  },
  
  // Thresholds
  "execute_threshold_percentage": 65,
  "history_budget_percentage": 0.15,
  "protected_tags": 20,
  "nudge_interval_tokens": 10000,
  
  // Heuristic cleanup
  "auto_drop_tool_age": 100,
  "drop_tool_structure": true,
  "clear_reasoning_age": 50,
  
  // Compressor
  "compressor": {
    "enabled": true,
    "min_compartment_ratio": 1000,
    "max_merge_depth": 5,
    "cooldown_ms": 600000,
    "max_compartments_per_pass": 15,
    "grace_compartments": 10
  },
  
  // Experimental
  "experimental": {
    "temporal_awareness": false,
    "git_commit_indexing": {
      "enabled": true,
      "since_days": 365,
      "max_commits": 2000
    },
    "auto_search": {
      "enabled": true,
      "score_threshold": 0.6,
      "min_prompt_chars": 20
    }
  },
  
  // System prompt injection
  "system_prompt_injection": {
    "enabled": true,
    "skip_signatures": ["<!-- magic-context: skip -->"]
  }
}
```

---

## Per-Model Overrides

Many settings support per-model overrides using an object with `default` and model-specific keys:

```jsonc
{
  "execute_threshold_percentage": {
    "default": 65,
    "anthropic/claude-haiku-4-5": 55,
    "anthropic/claude-sonnet-4": 70
  },
  "cache_ttl": {
    "default": "5m",
    "openai/gpt-5.2": "10m"
  }
}
```

Model keys use the format `provider/model-id` (e.g., `anthropic/claude-haiku-4-5`).
