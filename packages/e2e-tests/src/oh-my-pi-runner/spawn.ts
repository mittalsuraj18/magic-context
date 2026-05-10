/**
 * Spawn one isolated `omp --print` turn with Magic Context loaded
 * from the local oh-my-pi plugin package.
 *
 * CRITICAL: oh-my-pi cannot load the plugin directly from the monorepo
 * because the monorepo node_modules contains @oh-my-pi/pi-natives, a native
 * Node.js addon that crashes Bun inside oh-my-pi's plugin sandbox. We create
 * an isolated plugin copy with only dist/ + a minimal package.json.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "../../../..");
const OH_MY_PI_PLUGIN_ROOT = join(REPO_ROOT, "packages/oh-my-pi-plugin");

function findOhMyPiCLI(): string {
    // Try common locations for the omp binary
    const candidates = [
        join(REPO_ROOT, "node_modules/.bin/omp"),
        "/Users/surajmittal/.bun/bin/omp",
        join(REPO_ROOT, "node_modules/.bun/@oh-my-pi+pi-coding-agent@14.9.2/node_modules/@oh-my-pi/pi-coding-agent/dist/cli.js"),
    ];
    for (const path of candidates) {
        if (existsSync(path)) return path;
    }
    // Fall back to which omp
    try {
        const { execSync } = require("node:child_process");
        const result = execSync("which omp", { encoding: "utf-8" }).trim();
        if (result) return result;
    } catch {
        // ignore
    }
    throw new Error("omp binary not found. Install oh-my-pi first: npm install -g @oh-my-pi/pi-coding-agent");
}

export interface OhMyPiIsolatedEnv {
    baseDir: string;
    configDir: string;
    dataDir: string;
    cacheDir: string;
    workdir: string;
    agentDir: string;
    pluginDir: string;
}

export interface OhMyPiRunResult {
    sessionId: string | null;
    events: Array<Record<string, unknown>>;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
}

export interface OhMyPiSpawnOptions {
    mockProviderURL: string;
    env?: OhMyPiIsolatedEnv;
    magicContextConfig?: Record<string, unknown>;
    ompSettingsExtra?: Record<string, unknown>;
    modelContextLimit?: number;
    timeoutMs?: number;
    continueSession?: boolean;
}

export function createOhMyPiIsolatedEnv(sharedDataDir?: string): OhMyPiIsolatedEnv {
    const unique = `omp-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const baseDirRaw = join(tmpdir(), unique);
    mkdirSync(baseDirRaw, { recursive: true });
    const baseDir = realpathSync(baseDirRaw);
    const configDir = join(baseDir, "config");
    const dataDir = sharedDataDir ? realpathSync(sharedDataDir) : join(baseDir, "data");
    const cacheDir = join(baseDir, "cache");
    const workdir = join(baseDir, "work");
    const agentDir = join(baseDir, ".omp", "agent");
    const pluginDir = join(baseDir, ".omp", "plugins", "oh-my-pi-magic-context");
    for (const d of [configDir, dataDir, cacheDir, workdir, agentDir, join(baseDir, ".omp", "plugins")]) {
        mkdirSync(d, { recursive: true });
    }

    return {
        baseDir: realpathSync(baseDir),
        configDir: realpathSync(configDir),
        dataDir: realpathSync(dataDir),
        cacheDir: realpathSync(cacheDir),
        workdir: realpathSync(workdir),
        agentDir: realpathSync(agentDir),
        pluginDir,
    };
}

function ensurePluginAvailable(env: OhMyPiIsolatedEnv): void {
    const distEntry = join(OH_MY_PI_PLUGIN_ROOT, "dist", "index.js");
    if (!existsSync(distEntry)) {
        throw new Error(`${distEntry} is missing. Run: cd packages/oh-my-pi-plugin && bun run build`);
    }

    // Create isolated copy (NOT a symlink — that would pull in monorepo node_modules)
    if (!existsSync(env.pluginDir)) {
        mkdirSync(env.pluginDir, { recursive: true });
        mkdirSync(join(env.pluginDir, "dist"), { recursive: true });

        // Copy dist files
        for (const file of ["index.js", "subagent-entry.js"]) {
            const src = join(OH_MY_PI_PLUGIN_ROOT, "dist", file);
            const dst = join(env.pluginDir, "dist", file);
            if (existsSync(src)) {
                const { copyFileSync } = require("node:fs");
                copyFileSync(src, dst);
            }
        }

        // Write minimal package.json
        const pkg = {
            name: "@cortexkit/oh-my-pi-magic-context",
            version: "0.17.2",
            type: "module",
            main: "dist/index.js",
            exports: { ".": { import: "./dist/index.js" } },
            omp: { extensions: ["./dist/index.js"] },
        };
        writeFileSync(join(env.pluginDir, "package.json"), JSON.stringify(pkg, null, 2));
    }
}

function writeConfigs(env: OhMyPiIsolatedEnv, opts: OhMyPiSpawnOptions): void {
    ensurePluginAvailable(env);

    const settings = {
        packages: [env.pluginDir],
        defaultProvider: "anthropic",
        defaultModel: "claude-haiku-4-5",
        enabledModels: ["anthropic/claude-haiku-4-5"],
        compaction: { enabled: false },
        retry: { enabled: false },
        quietStartup: true,
        enableInstallTelemetry: false,
        ...(opts.ompSettingsExtra ?? {}),
    };
    writeFileSync(join(env.agentDir, "settings.json"), JSON.stringify(settings, null, 2));

    const models = {
        providers: {
            anthropic: {
                baseUrl: opts.mockProviderURL,
                apiKey: "test-key-not-real",
                modelOverrides: {
                    "claude-haiku-4-5": {
                        contextWindow: opts.modelContextLimit ?? 200000,
                        maxTokens: 8192,
                        reasoning: false,
                    },
                },
            },
        },
    };
    writeFileSync(join(env.agentDir, "models.json"), JSON.stringify(models, null, 2));

    const magicContext = {
        $schema:
            "https://raw.githubusercontent.com/cortexkit/magic-context/master/assets/magic-context.schema.json",
        enabled: true,
        ctx_reduce_enabled: true,
        protected_tags: 1,
        execute_threshold_percentage: 40,
        history_budget_percentage: 0.15,
        memory: { enabled: true, auto_promote: false },
        embedding: { provider: "off" },
        historian: { model: "" },
        dreamer: { enabled: false },
        sidekick: { enabled: false },
        experimental: {
            auto_search: { enabled: false },
            git_commit_indexing: { enabled: false },
        },
        ...(opts.magicContextConfig ?? {}),
    };
    writeFileSync(join(env.agentDir, "magic-context.jsonc"), JSON.stringify(magicContext, null, 2));
}

function childEnv(env: OhMyPiIsolatedEnv): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (value === undefined) continue;
        if (key === "NODE_ENV") continue;
        result[key] = value;
    }
    result.PI_CODING_AGENT_DIR = env.agentDir;
    result.HOME = env.baseDir;
    result.XDG_CONFIG_HOME = env.configDir;
    result.XDG_DATA_HOME = env.dataDir;
    result.XDG_CACHE_HOME = env.cacheDir;
    result.ANTHROPIC_API_KEY = "test-key-not-real";
    result.PI_OFFLINE = "1";
    result.PI_SKIP_VERSION_CHECK = "1";
    return result;
}

function parseJsonEvents(stdout: string): Array<Record<string, unknown>> {
    return stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
}

export async function spawnOhMyPiTurn(
    prompt: string,
    opts: OhMyPiSpawnOptions,
): Promise<{ env: OhMyPiIsolatedEnv; result: OhMyPiRunResult }> {
    const env = opts.env ?? createOhMyPiIsolatedEnv();
    writeConfigs(env, opts);

    const ompCLI = findOhMyPiCLI();
    const isJSCli = ompCLI.endsWith(".js");

    const args = isJSCli
        ? [
              ompCLI,
              "--print",
              "--mode",
              "json",
              ...(opts.continueSession ? ["--continue"] : []),
              "--no-extensions",
              "--extension",
              env.pluginDir,
              "--no-skills",
              "--no-prompt-templates",
              "--no-themes",
              "--model",
              "anthropic/claude-haiku-4-5",
              "--api-key",
              "test-key-not-real",
              prompt,
          ]
        : [
              "--print",
              "--mode",
              "json",
              ...(opts.continueSession ? ["--continue"] : []),
              "--no-extensions",
              "--extension",
              env.pluginDir,
              "--no-skills",
              "--no-prompt-templates",
              "--no-themes",
              "--model",
              "anthropic/claude-haiku-4-5",
              "--api-key",
              "test-key-not-real",
              prompt,
          ];

    const spawnCmd = isJSCli ? "bun" : ompCLI;
    const spawnArgs = isJSCli ? args : args;

    const child: ChildProcess = spawn(spawnCmd, spawnArgs, {
        cwd: env.workdir,
        env: childEnv(env),
        stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
    });

    const timeoutMs = opts.timeoutMs ?? 30_000;
    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveExit) => {
        const timer = setTimeout(() => {
            child.kill("SIGKILL");
            resolveExit({ code: null, signal: "SIGKILL" });
        }, timeoutMs);
        child.once("exit", (code, signal) => {
            clearTimeout(timer);
            resolveExit({ code, signal });
        });
    });

    let events: Array<Record<string, unknown>> = [];
    try {
        events = parseJsonEvents(stdout);
    } catch (error) {
        throw new Error(
            `oh-my-pi JSON output parse failed: ${error instanceof Error ? error.message : String(error)}\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`,
        );
    }

    const session = events.find((event) => event.type === "session") as { id?: string } | undefined;
    const result: OhMyPiRunResult = {
        sessionId: session?.id ?? null,
        events,
        stdout,
        stderr,
        exitCode: exit.code,
        signalCode: exit.signal,
    };

    if (exit.signal === "SIGKILL") {
        throw new Error(`oh-my-pi --print timed out after ${timeoutMs}ms\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`);
    }

    return { env, result };
}
