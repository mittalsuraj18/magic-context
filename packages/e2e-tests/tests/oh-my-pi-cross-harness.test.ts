/** @reference types="bun-types" */

import { Database } from "bun:sqlite";
import { afterAll, describe, expect, it } from "bun:test";
import { realpathSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { computeNormalizedHash } from "../../plugin/src/features/magic-context/memory/normalize-hash";
import { resolveProjectIdentity } from "../../plugin/src/features/magic-context/memory/project-identity";
import { TestHarness } from "../src/harness";
import { OhMyPiTestHarness } from "../src/oh-my-pi-harness";

let oc: TestHarness | null = null;
let omp: OhMyPiTestHarness | null = null;

afterAll(async () => {
    await omp?.dispose();
    await oc?.dispose();
});

function insertMemory(dbPath: string, projectIdentity: string, sessionId: string | null, content: string) {
    const db = new Database(dbPath);
    try {
        const now = Date.now();
        db.prepare(
            `INSERT INTO memories (
                project_path, category, content, normalized_hash,
                source_session_id, source_type, seen_count, retrieval_count,
                first_seen_at, created_at, updated_at, last_seen_at, status
            ) VALUES (?, 'WORKFLOW_RULES', ?, ?, ?, 'agent', 1, 0, ?, ?, ?, ?, 'active')`,
        ).run(projectIdentity, content, computeNormalizedHash(content), sessionId, now, now, now, now);
    } finally {
        db.close();
    }
}

describe("oh-my-pi cross harness", () => {
    it("shares project memories between OpenCode and oh-my-pi both directions", async () => {
        oc = await TestHarness.create();
        omp = await OhMyPiTestHarness.create({ sharedDataDir: oc.opencode.env.dataDir });

        const sharedWorkdir = realpathSync(pathResolve(oc.opencode.env.workdir));
        (omp.env as { workdir: string }).workdir = sharedWorkdir;
        const projectIdentity = resolveProjectIdentity(sharedWorkdir);

        oc.mock.reset();
        oc.mock.setDefault({
            text: "oc bootstrap",
            usage: { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 100 },
        });
        const ocSession = await oc.createSession();
        await oc.sendPrompt(ocSession, "bootstrap opencode shared db");

        omp.mock.reset();
        omp.mock.setDefault({
            text: "oh-my-pi bootstrap",
            usage: { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 100 },
        });
        const ompTurn = await omp.sendPrompt("bootstrap oh-my-pi shared db", { timeoutMs: 60_000 });
        const ompProjectIdentity = resolveProjectIdentity(realpathSync(pathResolve(omp.env.workdir)));

        const dbPath = omp.contextDbPath();
        const fromOpenCode = "OpenCode wrote this memory for oh-my-pi flagship search";
        insertMemory(dbPath, projectIdentity, ocSession, fromOpenCode);

        omp.mock.reset();
        omp.mock.setDefault({
            text: "oh-my-pi sees OpenCode memory",
            usage: { input_tokens: 140, output_tokens: 10, cache_creation_input_tokens: 140 },
        });
        await omp.sendPrompt("read flagship memory from oh-my-pi", { timeoutMs: 60_000 });
        expect(JSON.stringify(omp.mock.lastRequest()!.body)).toContain(fromOpenCode);

        const fromOhMyPi = "oh-my-pi wrote this memory for OpenCode injection";
        insertMemory(dbPath, ompProjectIdentity, ompTurn.sessionId, fromOhMyPi);

        oc.mock.reset();
        oc.mock.setDefault({
            text: "oc sees oh-my-pi",
            usage: { input_tokens: 130, output_tokens: 10, cache_creation_input_tokens: 130 },
        });
        await oc.sendPrompt(ocSession, "read oh-my-pi memory from opencode");
        expect(JSON.stringify(oc.mock.lastRequest()!.body)).toContain(fromOhMyPi);
    }, 120_000);
});
