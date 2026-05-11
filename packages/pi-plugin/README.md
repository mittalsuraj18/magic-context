# Magic Context - OMP extension

Cross-session memory and context management for [Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi). It shares the same SQLite database as the [OpenCode plugin](https://www.npmjs.com/package/@cortexkit/opencode-magic-context), so memories, embeddings, dreamer state, and project knowledge follow you across both harnesses.

> Beta release. The OMP extension is adapted from the original Pi extension and is published as `@cortexkit/omp-magic-context`. Core flows (tagging, historian, memories, dreamer, `/ctx-aug`) are designed for interactive `omp` sessions and `omp --print --mode json` subagents.

Requires `@oh-my-pi/pi-coding-agent` and `@oh-my-pi/pi-tui` `>= 14.9.0`.

## What It Does

Magic Context is a context engine that keeps long OMP sessions productive by:

| Feature | What it does |
|---|---|
| Tagging + drops | Tags every assistant/user/tool message with `§N§ ` so specific turns can be dropped later |
| Historian | Background subagent compresses old conversation into compartments + facts at threshold pressure or commit boundaries |
| `<session-history>` injection | Prepends compressed history into the system prompt every turn so the agent keeps context |
| Project memories | Persistent cross-session knowledge store with embedding-based semantic search |
| Dreamer | Scheduled background subagent that consolidates, verifies, archives, and improves stored memories |
| `/ctx-aug` | On-demand sidekick that augments the next turn with relevant memories |
| Auto-search hint | Appends a compact memory hint when prompts mention previously discussed topics |
| Note nudges | Surfaces deferred intentions at natural work boundaries |
| Cross-harness sharing | Memories written from OpenCode appear in OMP, and vice versa, for the same project |

## Installation

Install the published OMP extension package:

```bash
omp plugin install @cortexkit/omp-magic-context
```

For local development from this monorepo, build the package and link it into OMP:

```bash
bun run --cwd packages/pi-plugin build
omp plugin link packages/pi-plugin
```

The package includes both an `omp` manifest and the legacy `pi` manifest while the codebase finishes the rename internally.

## Configuration

Magic Context reads config files in this priority order:

1. `$cwd/.omp/magic-context.jsonc`
2. `$cwd/.omp/magic-context.json`
3. `~/.omp/agent/magic-context.jsonc`
4. `~/.omp/agent/magic-context.json`
5. Legacy `.pi` paths, if no OMP config is present

If `PI_CODING_AGENT_DIR` is set by the runtime, the user-level config is read from that directory first.

Minimal config:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/cortexkit/magic-context/master/assets/magic-context.schema.json",
  "enabled": true,
  "historian": {
    "model": "anthropic/claude-haiku-4-5"
  },
  "embedding": {
    "provider": "local"
  }
}
```

For the full configuration reference, see [CONFIGURATION.md](https://github.com/cortexkit/magic-context/blob/master/CONFIGURATION.md).

## Slash Commands

All commands use `triggerTurn: false`, so they are handled by the extension instead of being sent to the model:

| Command | What it does |
|---|---|
| `/ctx-status` | Live token breakdown + queued ops + cache state |
| `/ctx-flush` | Force-process pending ops queue |
| `/ctx-recomp` | Rebuild compartments from raw history |
| `/ctx-dream` | Trigger a dream run on demand |
| `/ctx-aug` | Augment your next prompt with sidekick-retrieved memories |

## Storage

Magic Context stores everything in a shared SQLite database at:

```text
~/.local/share/cortexkit/magic-context/context.db
```

This is the same database the OpenCode plugin uses. Tables are scoped by `harness` and `project_path`, so memories and dreamer state are shared across harnesses for the same project while per-session tagging stays separate.

For semantic search to work across harnesses, configure both plugins to use the same embedding model.

## Tools Available To The Agent

| Tool | Action set | Purpose |
|---|---|---|
| `ctx_search` | n/a | Search memories + raw session history; returns ranked results with previews |
| `ctx_memory` | `write`, `delete` | Manage project memories explicitly |
| `ctx_note` | `read`, `write`, `update`, `dismiss` | Defer intentions for later and surface them at work boundaries |

`ctx_expand` and `ctx_reduce` remain compatibility wrappers from the older Pi adapter. The normal OMP flow relies on threshold-driven historian compaction.

## Architecture

This package is part of the [magic-context monorepo](https://github.com/cortexkit/magic-context). The OMP extension shares core behavior with the OpenCode plugin through the `@magic-context/core` workspace dependency and keeps a thin OMP adapter layer:

| Module | Responsibility |
|---|---|
| `context-handler.ts` | Context hook adapter for tagging, drops, nudges, and auto-search |
| `subagent-runner.ts` | Spawns `omp --print --mode json --no-extensions --extension <lean-entry> ...` for historian, sidekick, and dreamer subagents |
| `tools/` | `pi.registerTool` wrappers around shared tool implementations |
| `commands/` | `pi.registerCommand` wrappers for `/ctx-*` slash commands |
| `dreamer/` | Adapter for the shared dreamer scheduler |
| `system-prompt.ts` | System-prompt injector for `<session-history>`, `<project-memory>`, and `<project-docs>` |
| `config/` | OMP config loader with legacy `.pi` fallback |

The runtime object is still named `pi` by the upstream OMP API packages, so some internal symbols intentionally keep that name.

## License

MIT - see [LICENSE](https://github.com/cortexkit/magic-context/blob/master/LICENSE).
