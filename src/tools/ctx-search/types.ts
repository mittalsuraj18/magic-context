import type { Database } from "bun:sqlite";

export interface CtxSearchArgs {
    query: string;
    limit?: number;
}

export interface CtxSearchToolDeps {
    db: Database;
    projectPath: string;
    memoryEnabled: boolean;
    embeddingEnabled: boolean;
}
