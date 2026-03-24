import type { DreamingTask } from "../../../config/schema/magic-context";

export const DREAMER_SYSTEM_PROMPT = `You are a memory maintenance agent for the magic-context system. You maintain a project's cross-session memory store. You have access to ctx_memory with extended actions (list, update, merge, archive) plus standard codebase tools (read, grep, glob, bash). Work methodically in batches. Explain reasoning briefly before each action. When verifying against code, always check actual files.`;

export function buildConsolidatePrompt(projectPath: string): string {
    return [
        `Project path: ${projectPath}`,
        "Goal: load all active memories, group semantic duplicates, and merge each duplicate cluster into one canonical memory.",
        '1. Call ctx_memory(action="list") to inspect active memories.',
        "2. Identify duplicate or overlapping entries by category.",
        '3. For each cluster, call ctx_memory(action="merge", ids=[...], content="canonical text", category="...") to preserve one canonical memory.',
        "4. Keep merged memories terse, operational, and de-duplicated.",
    ].join("\n");
}

export function buildVerifyPrompt(projectPath: string): string {
    return [
        `Project path: ${projectPath}`,
        "Goal: verify stored memories against the actual repository state.",
        '1. Call ctx_memory(action="list") to inspect memories.',
        "2. Verify CONFIG_DEFAULTS against schema/config files.",
        "3. Verify ARCHITECTURE_DECISIONS against actual file/module existence.",
        "4. Verify ENVIRONMENT entries against current repository paths and runtime assumptions.",
        '5. When a memory is still valid but wording is stale, call ctx_memory(action="update", id=..., content="...").',
    ].join("\n");
}

export function buildArchiveStalePrompt(projectPath: string): string {
    return [
        `Project path: ${projectPath}`,
        "Goal: archive memories that reference removed, obsolete, or invalid code paths/features.",
        '1. Call ctx_memory(action="list") to inspect active memories.',
        "2. Verify suspicious paths/features against the codebase with read/grep/glob.",
        '3. Archive stale memories with ctx_memory(action="archive", id=..., reason="...").',
        "4. Be conservative: archive only when the repository clearly contradicts the memory.",
    ].join("\n");
}

export function buildImprovePrompt(projectPath: string): string {
    return [
        `Project path: ${projectPath}`,
        "Goal: rewrite verbose or narrative memories into terse operational statements.",
        '1. Call ctx_memory(action="list") to inspect active memories.',
        "2. Find entries that are wordy, historical, or mixed-purpose.",
        '3. Rewrite them with ctx_memory(action="update", id=..., content="...") using present-tense operational language.',
        "4. Keep one rule/default/decision per memory when possible.",
    ].join("\n");
}

export function buildMaintainDocsPrompt(projectPath: string, lastDreamAt?: string | null): string {
    return [
        `Project path: ${projectPath}`,
        `Last dream at: ${lastDreamAt ?? "unknown"}`,
        "Goal: keep architecture docs synchronized with repository changes since the last dream run.",
        "1. Review git log since the last dream timestamp when available.",
        "2. Read .planning/codebase/ARCHITECTURE.md and .planning/codebase/STRUCTURE.md when they exist; create them with structured sections if missing.",
        "3. Update affected sections: layers, data flow, directory layout, and where new code should be added.",
        "4. Verify claims against actual files before writing docs.",
    ].join("\n");
}

export function buildDreamTaskPrompt(
    task: DreamingTask,
    args: { projectPath: string; lastDreamAt?: string | null },
): string {
    switch (task) {
        case "consolidate":
            return buildConsolidatePrompt(args.projectPath);
        case "verify":
            return buildVerifyPrompt(args.projectPath);
        case "archive-stale":
            return buildArchiveStalePrompt(args.projectPath);
        case "improve":
            return buildImprovePrompt(args.projectPath);
        case "maintain-docs":
            return buildMaintainDocsPrompt(args.projectPath, args.lastDreamAt);
    }
}
