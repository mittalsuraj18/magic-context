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

describe("oh-my-pi tagging", () => {
    it("applies §N§ tags and persists them with harness='oh-my-pi'", async () => {
        h.mock.reset();
        h.mock.setDefault({
            text: "tagged response",
            usage: { input_tokens: 120, output_tokens: 10, cache_creation_input_tokens: 120 },
        });

        const turn = await h.sendPrompt("please tag this oh-my-pi message", { timeoutMs: 60_000 });
        expect(turn.exitCode).toBe(0);
        expect(turn.sessionId).toBeTruthy();

        const req = h.mock.lastRequest();
        expect(JSON.stringify(req!.body)).toMatch(/§\d+§/);

        await h.waitFor(() => h.countTags(turn.sessionId!) > 0, {
            timeoutMs: 5000,
            label: "oh-my-pi tags persisted",
        });
        const row = h.contextDb()
            .prepare("SELECT harness FROM tags WHERE session_id = ? LIMIT 1")
            .get(turn.sessionId!) as { harness: string } | null;
        expect(row?.harness).toBe("oh-my-pi");
    }, 60_000);
});
