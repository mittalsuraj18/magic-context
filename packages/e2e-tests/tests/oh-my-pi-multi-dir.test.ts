/** @reference types="bun-types" */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { OhMyPiTestHarness } from "../src/oh-my-pi-harness";

let h: OhMyPiTestHarness;

beforeAll(async () => {
    h = await OhMyPiTestHarness.create({
        magicContextConfig: {
            enabled: true,
            ctx_reduce_enabled: true,
            memory: { enabled: true, auto_promote: false },
            embedding: { provider: "off" },
            dreamer: { enabled: true, schedule: "02:00-06:00", model: "anthropic/claude-haiku-4-5", tasks: ["consolidate"] },
            historian: { model: "anthropic/claude-haiku-4-5" },
        },
    });
});

afterAll(async () => {
    await h.dispose();
});

describe("oh-my-pi multi-directory", () => {
    it("plugin works when run from a different directory than load", async () => {
        h.mock.reset();
        h.mock.setDefault({
            text: "multi-dir test ok",
            usage: { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 100 },
        });

        const turn = await h.sendPrompt("hello from multi directory test", { timeoutMs: 60_000 });
        expect(turn.exitCode).toBe(0);
        expect(turn.stderr).not.toContain("Segmentation fault");
        expect(turn.sessionId).toBeTruthy();

        // Verify tools are registered regardless of directory
        const req = h.mock.lastRequest();
        expect(req).not.toBeNull();
        const body = JSON.stringify(req!.body);
        expect(body).toContain("ctx_search");
        expect(body).toContain("ctx_memory");

        // Verify tags were created for this session
        expect(h.countTags(turn.sessionId!)).toBeGreaterThan(0);
    }, 60_000);

    it("/ctx-dream command does not crash from a different project directory", async () => {
        h.mock.reset();
        h.mock.setDefault({
            text: "dream command test",
            usage: { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 100 },
        });

        const turn = await h.sendPrompt("run ctx-dream command test", { timeoutMs: 60_000 });
        expect(turn.exitCode).toBe(0);
        expect(turn.stderr).not.toContain("dreamer not registered");
        expect(turn.stderr).not.toContain("Segmentation fault");
        expect(turn.sessionId).toBeTruthy();
    }, 60_000);
});
