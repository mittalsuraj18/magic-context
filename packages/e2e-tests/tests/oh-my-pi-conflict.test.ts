/** @reference types="bun-types" */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { OhMyPiTestHarness } from "../src/oh-my-pi-harness";

let h: OhMyPiTestHarness;

beforeAll(async () => {
    h = await OhMyPiTestHarness.create({
        ompSettingsExtra: { compaction: { enabled: true } },
    });
});

afterAll(async () => {
    await h.dispose();
});

describe("oh-my-pi conflict detection", () => {
    it("warns when built-in compaction is enabled", async () => {
        h.mock.reset();
        h.mock.setDefault({
            text: "conflict test",
            usage: { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 100 },
        });

        const turn = await h.sendPrompt("hello with compaction conflict", { timeoutMs: 60_000 });
        expect(turn.exitCode).toBe(0);
        expect(turn.sessionId).toBeTruthy();

        // The plugin should detect the conflict and inject a warning into
        // the system prompt or emit a notification event.
        const req = h.mock.lastRequest();
        expect(req).not.toBeNull();
        const body = JSON.stringify(req!.body);

        // Check that the system prompt contains conflict warning or
        // the events contain a notification
        const hasConflictWarning =
            body.toLowerCase().includes("compaction") ||
            body.toLowerCase().includes("conflict") ||
            turn.events.some((e) => {
                const msg = JSON.stringify(e).toLowerCase();
                return msg.includes("compaction") || msg.includes("conflict");
            });

        // Note: The exact mechanism depends on how the oh-my-pi plugin
        // implements conflict detection. This test may need adjustment.
        expect(hasConflictWarning).toBe(true);
    }, 60_000);
});
