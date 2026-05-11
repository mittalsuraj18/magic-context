/** @reference types="bun-types" */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { OhMyPiTestHarness } from "../src/oh-my-pi-harness";

let h: OhMyPiTestHarness;

beforeAll(async () => {
    h = await OhMyPiTestHarness.create();
});

afterAll(async () => {
    await h.dispose();
});

describe("oh-my-pi system prompt", () => {
    // Note: oh-my-pi's --print mode does not emit before_agent_start events
    // in the JSON event stream, and may not call before_agent_start handlers
    // the same way as interactive mode. These tests verify the plugin loads
    // without crashing; full system-prompt injection testing requires
    // interactive mode or a different harness setup.

    it("plugin loads without crashing in print mode", async () => {
        h.mock.reset();
        h.mock.setDefault({
            text: "system prompt test",
            usage: { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 100 },
        });

        const turn = await h.sendPrompt("test system prompt injection", { timeoutMs: 60_000 });
        expect(turn.exitCode).toBe(0);
        expect(turn.sessionId).toBeTruthy();
        expect(turn.stderr).not.toContain("Segmentation fault");
    }, 60_000);

    it("tools are registered (proving plugin loaded)", async () => {
        h.mock.reset();
        h.mock.setDefault({
            text: "type check",
            usage: { input_tokens: 80, output_tokens: 10, cache_creation_input_tokens: 80 },
        });

        const turn = await h.sendPrompt("verify system prompt type", { timeoutMs: 60_000 });
        expect(turn.exitCode).toBe(0);

        // Verify Magic Context tools are in the request body
        const req = h.mock.lastRequest();
        expect(req).not.toBeNull();
        const body = JSON.stringify(req!.body);
        expect(body).toContain("ctx_search");
        expect(body).toContain("ctx_memory");
        expect(body).toContain("ctx_note");
    }, 60_000);
});
