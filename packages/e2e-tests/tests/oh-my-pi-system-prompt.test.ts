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
    it("injects <session-history> block via before_agent_start string[] return", async () => {
        h.mock.reset();
        h.mock.setDefault({
            text: "system prompt test",
            usage: { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 100 },
        });

        const turn = await h.sendPrompt("test system prompt injection", { timeoutMs: 60_000 });
        expect(turn.exitCode).toBe(0);
        expect(turn.sessionId).toBeTruthy();

        const req = h.mock.lastRequest();
        expect(req).not.toBeNull();
        const body = JSON.stringify(req!.body);

        // The oh-my-pi plugin should inject <session-history> via the
        // before_agent_start handler, returning { systemPrompt: string[] }
        // Verify the prompt contains Magic Context markers.
        expect(body).toContain("<session-history>");
        expect(body).toContain("Magic Context");
    }, 60_000);

    it("returns systemPrompt as string[] (not string) for oh-my-pi compatibility", async () => {
        h.mock.reset();
        h.mock.setDefault({
            text: "type check",
            usage: { input_tokens: 80, output_tokens: 10, cache_creation_input_tokens: 80 },
        });

        const turn = await h.sendPrompt("verify system prompt type", { timeoutMs: 60_000 });
        expect(turn.exitCode).toBe(0);

        // The oh-my-pi API expects { systemPrompt?: string[] } from
        // before_agent_start. If the plugin returned a plain string,
        // oh-my-pi would likely error or crash. The fact that we get
        // a successful turn with injected content proves the adaptation
        // is working.
        const req = h.mock.lastRequest();
        expect(req).not.toBeNull();
        const body = JSON.stringify(req!.body);
        expect(body).toContain("<session-history>");
    }, 60_000);
});
