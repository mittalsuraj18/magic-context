import { enqueueDream } from "@magic-context/core/features/magic-context/dreamer/queue";
import type { ContextDatabase } from "@magic-context/core/features/magic-context/storage";
import { sessionLog } from "@magic-context/core/shared/logger";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import {
	isPiDreamerProjectRegistered,
	runPiDreamForProject,
} from "../dreamer";
import { sendCtxStatusMessage } from "./pi-command-utils";

export function registerCtxDreamCommand(
	pi: ExtensionAPI,
	deps: {
		db: ContextDatabase;
		projectDir: string;
		projectIdentity: string;
		isDreamerRegistered?: (projectIdentity: string) => boolean;
		runDreamForProject?: (
			projectIdentity: string,
		) => ReturnType<typeof runPiDreamForProject>;
	},
): void {
	pi.registerCommand("ctx-dream", {
		description: "Run a Magic Context dreamer cycle for this project now",
		handler: async () => {
			const isRegistered =
				deps.isDreamerRegistered ?? isPiDreamerProjectRegistered;
			if (!isRegistered(deps.projectIdentity)) {
				sendCtxStatusMessage(
					pi,
					{
						title: "/ctx-dream",
						text: [
							"## /ctx-dream",
							"",
							"Dreamer is not enabled for this project, so no dream run was queued.",
							"Add `dreamer.enabled: true` to your Magic Context config, then restart OMP.",
						].join("\n"),
						level: "warning",
					},
					{
						projectDir: deps.projectDir,
						projectIdentity: deps.projectIdentity,
						entry: null,
					},
				);
				return;
			}

			const enqueued = enqueueDream(
				deps.db,
				deps.projectIdentity,
				"manual",
				true,
			);
			if (!enqueued) {
				// An existing unstarted row is still actionable: try to drain
				// it immediately. If another worker already claimed the queue,
				// runDreamForProject returns null and we report that below.
				sendCtxStatusMessage(
					pi,
					{
						title: "/ctx-dream",
						text: [
							"## /ctx-dream",
							"",
							`Dream already queued or running for ${deps.projectIdentity}; attempting to drain the queue now…`,
						].join("\n"),
						level: "info",
					},
					{
						projectDir: deps.projectDir,
						projectIdentity: deps.projectIdentity,
						entry: null,
					},
				);
			} else {
				// Tell the user we're starting a real run, not just queueing.
				sendCtxStatusMessage(
					pi,
					{
						title: "/ctx-dream",
						text: [
							"## /ctx-dream",
							"",
							`Starting dream run #${enqueued.id} for ${deps.projectIdentity}…`,
							`Project directory: ${deps.projectDir}`,
						].join("\n"),
						level: "info",
					},
					{
						projectDir: deps.projectDir,
						projectIdentity: deps.projectIdentity,
						entry: enqueued,
					},
				);
			}

			// OpenCode parity (command-handler.ts:236-246): immediately drain
			// the dream queue from the same registered client/config the
			// timer uses. Pi previously left this to the 15-min timer, so
			// /ctx-dream felt broken.
			try {
				const runDreamForProject =
					deps.runDreamForProject ?? runPiDreamForProject;
				const result = await runDreamForProject(deps.projectIdentity);
				let summary: string;
				let level: "info" | "success" | "warning" = "info";
				if (!result) {
					summary =
						"No queued dream was claimable; another worker may already be processing it.";
				} else {
					const leaseError = result.tasks.find(
						(task) => task.name === "lease" && task.error,
					);
					if (leaseError) {
						level = "warning";
						summary = [
							"Dreamer is busy; no dream tasks ran.",
							`- ${leaseError.error}`,
							"- Wait for the active dreamer to finish, then run `/ctx-dream` again.",
						].join("\n");
					} else {
						level = "success";
						const taskLines = result.tasks
							.map((task) => {
								const status = task.error ? `error: ${task.error}` : "ok";
								return `- ${task.name} (${(task.durationMs / 1000).toFixed(1)}s) — ${status}`;
							})
							.join("\n");
						const failureCount = result.tasks.filter((t) => t.error).length;
						summary = [
							`Dream run complete in ${((result.finishedAt - result.startedAt) / 1000).toFixed(1)}s.`,
							`- Tasks: ${result.tasks.length} (${failureCount} failed)`,
							`- Smart notes surfaced: ${result.smartNotesSurfaced}, pending: ${result.smartNotesPending}`,
							"",
							taskLines,
						].join("\n");
					}
				}

				sendCtxStatusMessage(
					pi,
					{
						title: "/ctx-dream",
						text: ["## /ctx-dream", "", summary].join("\n"),
						level,
					},
					{
						projectDir: deps.projectDir,
						projectIdentity: deps.projectIdentity,
						entry: enqueued ?? null,
					},
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				sessionLog(
					deps.projectIdentity,
					`pi /ctx-dream failed to drain queue: ${message}`,
				);
				sendCtxStatusMessage(
					pi,
					{
						title: "/ctx-dream",
						text: [
							"## /ctx-dream",
							"",
							`Dream run failed: ${message}`,
							"The queued entry remains; the registered timer will retry on its next tick.",
						].join("\n"),
						level: "error",
					},
					{
						projectDir: deps.projectDir,
						projectIdentity: deps.projectIdentity,
						entry: enqueued ?? null,
					},
				);
			}
		},
	});
}
