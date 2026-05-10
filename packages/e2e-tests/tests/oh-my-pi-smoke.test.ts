/** @reference types="bun-types" */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { OhMyPiTestHarness } from "../src/oh-my-pi-harness";

// TODO(oh-my-pi --print mode): add oh-my-pi historian-success, dreamer-schedule,
// and sidekick/ctx-aug e2e coverage once async listeners/subagent runs survive
// agent_end in single-shot mode.

let h: OhMyPiTestHarness;

beforeAll(async () => {
    h = await OhMyPiTestHarness.create();
});

afterAll(async () => {
    await h.dispose();
});

describe("oh-my-pi smoke", () => {
    it("plugin loads, no crash, and tools are registered", async () => {
        h.mock.reset();
        h.mock.setDefault({
            text: "oh my pi smoke ok",
            usage: { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 100 },
        });

        const turn = await h.sendPrompt("hello from oh my pi smoke", { timeoutMs: 60_000 });
        expect(turn.exitCode).toBe(0);
        expect(turn.stderr).not.toContain("Failed to load extension");
        expect(turn.stderr).not.toContain("Segmentation fault");
        expect(turn.sessionId).toBeTruthy();

        const req = h.mock.lastRequest();
        expect(req).not.toBeNull();
        const body = JSON.stringify(req!.body);
        expect(body).toContain("hello from oh my pi smoke");
        expect(body).toContain("ctx_search");
        expect(body).toContain("ctx_memory");
        expect(body).toContain("ctx_note");
        expect(h.countTags(turn.sessionId!)).toBeGreaterThan(0);
    }, 60_000);
});
