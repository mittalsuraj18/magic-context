# Magic Context — Oh My Pi extension

Cross-session memory and context management for [oh-my-pi](https://github.com/can1357/oh-my-pi) (`@oh-my-pi/pi-coding-agent`). Shares the same SQLite database as the OpenCode plugin, so memories, embeddings, dreamer state, and project knowledge follow you across both harnesses.

Requires `@oh-my-pi/pi-coding-agent` and `@oh-my-pi/pi-tui` `>= 0.71.0`.

---

## Installation

### Method 1: Quick Setup via CLI (when published)

```bash
npx @cortexkit/magic-context@latest setup --harness oh-my-pi
```

### Method 2: Local Development Install (from source)

This is the recommended method when developing or testing changes locally.

#### Step 1 — Build the plugin

```bash
# From the repo root
bun run --cwd packages/oh-my-pi-plugin build
```

This produces:
- `packages/oh-my-pi-plugin/dist/index.js` (main extension)
- `packages/oh-my-pi-plugin/dist/subagent-entry.js` (subagent entry)

#### Step 2 — Create an isolated copy

**Important:** Do not point oh-my-pi directly at the monorepo directory. The monorepo's `node_modules` contains `@oh-my-pi/pi-natives`, a native Node.js addon that crashes Bun when loaded inside oh-my-pi's plugin sandbox. Instead, create a minimal isolated copy with only the built files:

```bash
mkdir -p /tmp/oh-my-pi-magic-context-plugin
cp -r packages/oh-my-pi-plugin/dist/* /tmp/oh-my-pi-magic-context-plugin/
```

Create a minimal `package.json` in the isolated directory:

```bash
cat > /tmp/oh-my-pi-magic-context-plugin/package.json << 'EOF'
{
  "name": "@cortexkit/oh-my-pi-magic-context",
  "version": "0.17.2",
  "type": "module",
  "main": "dist/index.js",
  "exports": {
    ".": {
      "import": "./dist/index.js"
    }
  },
  "omp": {
    "extensions": [
      "./dist/index.js"
    ]
  }
}
EOF
```

#### Step 3 — Register with oh-my-pi

Edit `~/.omp/plugins/package.json` (create the directory/file if needed):

```json
{
  "name": "omp-plugins",
  "private": true,
  "dependencies": {
    "@cortexkit/oh-my-pi-magic-context": "file:/tmp/oh-my-pi-magic-context-plugin"
  }
}
```

Then install:

```bash
cd ~/.omp/plugins && npm install
```

#### Step 4 — Enable in oh-my-pi's plugin lock

Edit `~/.omp/plugins/omp-plugins.lock.json`:

```json
{
  "plugins": {
    "@cortexkit/oh-my-pi-magic-context": {
      "version": "0.17.2",
      "enabledFeatures": null,
      "enabled": true
    }
  },
  "settings": {}
}
```

#### Step 5 — Verify installation

```bash
omp plugin list
# Should show: @cortexkit/oh-my-pi-magic-context@0.17.2

omp plugin doctor
# Should show: plugin:@cortexkit/oh-my-pi-magic-context: v0.17.2
```

#### Step 6 — Restart oh-my-pi

Kill any running `omp` processes and start a new session. The extension loads automatically on startup.

---

### Rebuild After Code Changes

```bash
# From the repo root
bun run --cwd packages/oh-my-pi-plugin build
cp -r packages/oh-my-pi-plugin/dist/* /tmp/oh-my-pi-magic-context-plugin/dist/
```

Then restart oh-my-pi.

**Shell alias for rapid iteration:**

```bash
alias rebuild-omp="bun run --cwd ~/Desktop/magic-context/packages/oh-my-pi-plugin build && cp -r ~/Desktop/magic-context/packages/oh-my-pi-plugin/dist/* /tmp/oh-my-pi-magic-context-plugin/dist/"
```

---

## Configuration

Magic Context reads two config files (in this priority order):

1. `$cwd/.omp/magic-context.jsonc` (project-level overrides)
2. `~/.omp/agent/magic-context.jsonc` (user-level defaults)

Both are merged through a Zod schema. Invalid fields fall back to defaults — bad config never disables the plugin entirely.

### Minimal config

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

For the full configuration reference, see [CONFIGURATION.md](https://github.com/cortexkit/magic-context/blob/master/CONFIGURATION.md) in the main repository.

---

## Slash commands

All commands trigger `triggerTurn: false` (never sent to the LLM):

| Command | What it does |
|---|---|
| `/ctx-status` | Live token breakdown + queued ops + cache state |
| `/ctx-flush` | Force-process pending ops queue |
| `/ctx-recomp` | Rebuild compartments from raw history (heavy operation) |
| `/ctx-dream` | Trigger a dream run on demand |
| `/ctx-aug` | Augment your next prompt with sidekick-retrieved memories |

---

## Storage

Magic Context stores everything in a single shared SQLite database at:

```
~/.local/share/cortexkit/magic-context/context.db
```

This is the **same database** the OpenCode plugin uses. Tables are scoped by:
- `harness` column (`'oh-my-pi'` or `'opencode'`) for session-scoped data (tags, compartments, facts, notes)
- `project_path` (resolved git root) for project-scoped data (memories, embeddings, dreamer runs)

So memories and dreamer state are shared across both harnesses for the same project; per-session tagging stays correctly attributed.

---

## Cross-harness coherence

For semantic search to work across harnesses, both plugins must use the **same embedding model**. Magic Context detects mismatch on oh-my-pi startup and warns.

---

## Tools available to the agent

| Tool | Action set | Purpose |
|---|---|---|
| `ctx_search` | n/a | Search memories + raw session history; returns ranked results with previews |
| `ctx_memory` | `write`, `delete` | Manage project memories explicitly |
| `ctx_note` | `read`, `write`, `update`, `dismiss` | Defer intentions for later |

---

## License

MIT — see [LICENSE](https://github.com/cortexkit/magic-context/blob/master/LICENSE).
