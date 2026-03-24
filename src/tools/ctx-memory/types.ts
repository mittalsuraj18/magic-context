import type { Database } from "bun:sqlite";
import type { MemorySourceType } from "../../features/magic-context/memory";

export const CTX_MEMORY_ACTIONS = [
    "write",
    "delete",
    "search",
    "list",
    "update",
    "merge",
    "archive",
] as const;

export type CtxMemoryAction = (typeof CTX_MEMORY_ACTIONS)[number];

export interface CtxMemoryArgs {
    action: CtxMemoryAction;
    content?: string;
    category?: string;
    id?: number;
    ids?: number[];
    query?: string;
    limit?: number;
    reason?: string;
}

export interface CtxMemoryToolDeps {
    db: Database;
    projectPath: string;
    memoryEnabled: boolean;
    embeddingEnabled: boolean;
    allowedActions?: CtxMemoryAction[];
    sourceType?: MemorySourceType;
}

export interface CtxMemorySearchResult {
    id: number;
    category: string;
    content: string;
    score: number;
    source: string;
}
