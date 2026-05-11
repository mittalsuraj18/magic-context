import type { DreamerConfig, EmbeddingConfig } from "@magic-context/core/config/schema/magic-context";
import { enqueueDream } from "@magic-context/core/features/magic-context/dreamer/queue";
import { resolveProjectIdentity } from "@magic-context/core/features/magic-context/memory/project-identity";
import type { ContextDatabase } from "@magic-context/core/features/magic-context/storage";
import { sessionLog } from "@magic-context/core/shared/logger";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { runPiDreamForProject, type PiDreamerOptions } from "../dreamer";
import { sendCtxStatusMessage } from "./pi-command-utils";

export function registerCtxDreamCommand(
	pi: ExtensionAPI,
	deps: {
		db: ContextDatabase;
		projectDir: string;
		projectIdentity: string;
		/** Dreamer config for lazy on-demand registration when the user
		 *  changes directories after plugin load. */
		dreamerConfig?: DreamerConfig;
		embeddingConfig?: EmbeddingConfig;
		memoryEnabled?: boolean;
	},
): void {
	pi.registerCommand("ctx-dream", {
		description: "Run a Magic Context dreamer cycle for this project now",
		handler: async (_args, ctx: ExtensionContext) => {
			// Resolve the CURRENT working directory from the session context,
			// NOT the static projectDir captured at plugin load time. The
			// user may have changed directories since omp started.
			const cwd = ctx.cwd ?? deps.projectDir;
			const currentIdentity = resolveProjectIdentity(cwd);

			const enqueued = enqueueDream(deps.db, currentIdentity, "manual");
			if (!enqueued) {
				// Already queued or actively running. Mirrors OpenCode's
				// behavior at command-handler.ts:230 — if enqueue returns
				// null we don't kick off another cycle.
				sendCtxStatusMessage(
					pi,
					{
						title: "/ctx-dream",
						text: [
							"## /ctx-dream",
							"",
							`Dream already queued or running for ${currentIdentity}.`,
						].join("\n"),
						level: "info",
					},
					{
						projectDir: cwd,
						projectIdentity: currentIdentity,
						entry: null,
					},
				);
				return;
			}

			// Tell the user we're starting a real run, not just queueing.
			sendCtxStatusMessage(
				pi,
				{
					title: "/ctx-dream",
					text: [
						"## /ctx-dream",
						"",
						`Starting dream run #${enqueued.id} for ${currentIdentity}…`,
						`Project directory: ${cwd}`,
					].join("\n"),
					level: "info",
				},
				{
					projectDir: cwd,
					projectIdentity: currentIdentity,
					entry: enqueued,
				},
			);

			// Build fallback options for lazy registration if the user
			// changed directories and the dreamer isn't registered for
			// this project yet.
			const fallbackOpts: PiDreamerOptions | undefined =
				deps.dreamerConfig && deps.dreamerConfig.enabled
					? {
							db: deps.db,
							projectDir: cwd,
							projectIdentity: currentIdentity,
							config: deps.dreamerConfig,
							embeddingConfig: deps.embeddingConfig ?? { provider: "off" },
							memoryEnabled: deps.memoryEnabled ?? true,
						}
					: undefined;

			// OpenCode parity (command-handler.ts:236-246): immediately drain
			// the dream queue from the same registered client/config the
			// timer uses. Pi previously left this to the 15-min timer, so
			// /ctx-dream felt broken.
			try {
				const result = await runPiDreamForProject(
					currentIdentity,
					fallbackOpts,
				);
				let summary: string;
				if (!result) {
					summary =
						"Dream queued, but another worker is already processing the queue.";
				} else {
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

				sendCtxStatusMessage(
					pi,
					{
						title: "/ctx-dream",
						text: ["## /ctx-dream", "", summary].join("\n"),
						level: result ? "success" : "info",
					},
					{
						projectDir: cwd,
						projectIdentity: currentIdentity,
						entry: enqueued,
					},
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				sessionLog(
					currentIdentity,
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
						projectDir: cwd,
						projectIdentity: currentIdentity,
						entry: enqueued,
					},
				);
			}
		},
	});
}
