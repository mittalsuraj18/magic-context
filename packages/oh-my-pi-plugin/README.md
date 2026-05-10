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

## Testing & Verification

After installation, run through these checks to confirm everything works:

### 1. Plugin loads without crashing

```bash
omp --version
# Should print: omp/14.9.2 (or your version)
# Should NOT crash with a segfault
```

If you see a Bun crash mentioning `pi_natives.darwin-arm64.node`, the isolated copy wasn't set up correctly — go back to Step 2 in the Installation section.

### 2. Plugin appears in the plugin list

```bash
omp plugin list
```

Expected output:
```
npm Plugins:

● @cortexkit/oh-my-pi-magic-context@0.17.2
```

### 3. Doctor passes

```bash
omp plugin doctor
```

Expected: no errors for `@cortexkit/oh-my-pi-magic-context`. (The `context-mode` orphan warning is normal if you don't have that plugin installed.)

### 4. Start a session and check commands

Start oh-my-pi in any project directory:

```bash
omp
```

Once the session is running, type:

```
/ctx-status
```

**What to expect:**
- A status message showing token breakdown, active tags, compartments, memories, notes, and dreamer state
- If UI is available, a dialog overlay with live stats
- No error messages in the terminal

### 5. Test memory write and search

In the same session, ask the agent to:

```
Please use ctx_memory to write a test memory: category=TEST, content="oh-my-pi plugin is working"
```

Then:

```
Please use ctx_search to search for "oh-my-pi plugin"
```

**What to expect:**
- `ctx_memory` returns a success message with a memory ID
- `ctx_search` returns the memory you just wrote
- No "tool not found" errors

### 6. Test notes

```
Please use ctx_note to write a note: "Test note from oh-my-pi session"
```

Then:

```
Please use ctx_note to read notes
```

**What to expect:**
- Write returns a note ID
- Read returns the note content

### 7. Check system prompt injection

After a few turns, check that the system prompt contains the Magic Context block. The easiest way is to ask:

```
What do you know about this project's architecture?
```

If `inject_docs` is enabled (default: true) and the project has `ARCHITECTURE.md` or `STRUCTURE.md`, the agent should reference those docs even if they weren't explicitly read this session.

### 8. Test historian (optional — takes time)

Have a long conversation (20+ turns) or manually trigger:

```
/ctx-dream
```

**What to expect:**
- The dreamer runs in the background
- After completion, new compartments appear in `/ctx-status`
- No crash or hang

### 9. Check cross-session persistence

End the session (`/exit` or Ctrl+C), then start a new `omp` session in the **same project directory**:

```
Please use ctx_search to search for "oh-my-pi plugin"
```

**What to expect:**
- The memory written in step 5 should still appear
- This confirms the SQLite database is working and cross-session memory is functional

### 10. Verify shared database (if using OpenCode too)

If you also use OpenCode with Magic Context in the same project:

1. Write a memory in OpenCode: `ctx_memory(action="write", category="TEST", content="shared memory test")`
2. Switch to oh-my-pi in the same project
3. Search: `ctx_search(query="shared memory test")`

**What to expect:**
- The memory written in OpenCode appears in oh-my-pi
- This confirms cross-harness sharing is working

---

## Troubleshooting

### Bun segfault on startup

**Symptom:** `panic(main thread): Segmentation fault at address 0x40` mentioning `pi_natives.darwin-arm64.node`

**Cause:** oh-my-pi loaded `@oh-my-pi/pi-natives` from the monorepo's `node_modules` instead of its own.

**Fix:** Ensure you're using the isolated copy at `/tmp/oh-my-pi-magic-context-plugin/` (not the monorepo directory directly). Re-run the install steps.

### Plugin not showing in `omp plugin list`

**Symptom:** `No plugins installed`

**Fix:**
1. Check `~/.omp/plugins/package.json` has the `file:` dependency
2. Run `cd ~/.omp/plugins && npm install`
3. Check `~/.omp/plugins/omp-plugins.lock.json` has the plugin enabled

### Commands not found (/ctx-status returns "unknown command")

**Symptom:** oh-my-pi says the slash command doesn't exist

**Fix:** The plugin didn't register properly. Check:
1. `omp plugin doctor` shows the plugin
2. Restart oh-my-pi completely (kill all `omp` processes)
3. Check the oh-my-pi logs for plugin loading errors

### Tools not available (ctx_memory not found)

**Symptom:** Agent says "I don't have a ctx_memory tool"

**Fix:**
1. Check `~/.omp/agent/magic-context.jsonc` has `"enabled": true`
2. The plugin may have failed to open the database — check `~/.local/share/cortexkit/magic-context/` exists
3. Restart the session

### Database errors

**Symptom:** Status shows "No active Pi session" or SQLite errors

**Fix:**
```bash
# Check database integrity
npx @cortexkit/magic-context@latest doctor --harness oh-my-pi

# If corrupted, the doctor will suggest fixes
```

### Build errors after code changes

**Symptom:** `bun run --cwd packages/oh-my-pi-plugin build` fails

**Fix:**
```bash
# Clean and rebuild
bun run --cwd packages/oh-my-pi-plugin clean
bun run --cwd packages/oh-my-pi-plugin build

# Copy to isolated location
cp -r packages/oh-my-pi-plugin/dist/* /tmp/oh-my-pi-magic-context-plugin/dist/
```

---

## License

MIT — see [LICENSE](https://github.com/cortexkit/magic-context/blob/master/LICENSE).
