import { afterEach, describe, expect, test } from "bun:test";
import { DreamerConfigSchema } from "@magic-context/core/config/schema/magic-context";
import { ensureDreamQueueTable } from "@magic-context/core/features/magic-context/dreamer";
import { initializeDatabase } from "@magic-context/core/features/magic-context/storage-db";
import { Database } from "@magic-context/core/shared/sqlite";
import { closeQuietly } from "@magic-context/core/shared/sqlite-helpers";
import {
	__test,
	awaitInFlightDreamers,
	registerPiDreamerProject,
	runPiDreamForProject,
	unregisterPiDreamerProject,
} from ".";

let db: Database | null = null;

function createDb(): Database {
	const database = new Database(":memory:");
	initializeDatabase(database);
	ensureDreamQueueTable(database);
	return database;
}

function enabledConfig() {
	return DreamerConfigSchema.parse({
		enabled: true,
		schedule: "00:00-23:59",
		model: "test/model",
		tasks: ["consolidate"],
	});
}

function disabledConfig() {
	return DreamerConfigSchema.parse({ enabled: false });
}

afterEach(() => {
	__test.reset();
	if (db) {
		closeQuietly(db);
		db = null;
	}
});

describe("Pi dreamer wiring", () => {
	test("disabled config is a no-op", () => {
		db = createDb();

		registerPiDreamerProject({
			db,
			projectDir: "/tmp/pi-project-disabled",
			projectIdentity: "git:pi-disabled",
			config: disabledConfig(),
		});

		expect(__test.registeredProjectCount()).toBe(0);
	});

	test("enabled config registers once for the same project", () => {
		db = createDb();
		const config = enabledConfig();
		const opts = {
			db,
			projectDir: "/tmp/pi-project-enabled",
			projectIdentity: "git:pi-enabled",
			config,
		};

		registerPiDreamerProject(opts);
		registerPiDreamerProject(opts);

		expect(__test.registeredProjectCount()).toBe(1);
	});

	test("unregister removes the project", () => {
		db = createDb();
		registerPiDreamerProject({
			db,
			projectDir: "/tmp/pi-project-unregister",
			projectIdentity: "git:pi-unregister",
			config: enabledConfig(),
		});

		unregisterPiDreamerProject({ projectIdentity: "git:pi-unregister" });

		expect(__test.registeredProjectCount()).toBe(0);
	});

	test("awaitInFlightDreamers resolves immediately when nothing is running", async () => {
		await expect(awaitInFlightDreamers()).resolves.toBeUndefined();
	});

	test("runPiDreamForProject with fallbackOpts lazily registers and runs", async () => {
		db = createDb();
		const config = enabledConfig();
		const projectIdentity = "git:lazy-project";

		// Not registered yet
		expect(__test.registeredProjectCount()).toBe(0);

		// Pass fallbackOpts — should register on-the-fly
		const fallbackOpts = {
			db,
			projectDir: "/tmp/lazy-project",
			projectIdentity,
			config,
			embeddingConfig: { provider: "off" as const },
			memoryEnabled: true,
		};

		// No queue entry exists, so it returns null (nothing to drain).
		// The key assertion: it does NOT throw "not registered" —
		// proving lazy registration worked.
		const result = await runPiDreamForProject(projectIdentity, fallbackOpts);
		expect(result).toBeNull();

		// Project should now be registered
		expect(__test.registeredProjectCount()).toBe(1);
	});

	test("runPiDreamForProject without fallbackOpts throws when not registered", async () => {
		db = createDb();
		const projectIdentity = "git:unregistered-project";

		await expect(runPiDreamForProject(projectIdentity)).rejects.toThrow(
			/dreamer not registered/,
		);
	});

	test("lazy registration reuses existing registration when project already registered", async () => {
		db = createDb();
		const config = enabledConfig();
		const projectIdentity = "git:double-register";
		const opts = {
			db,
			projectDir: "/tmp/double",
			projectIdentity,
			config,
		};

		registerPiDreamerProject(opts);
		expect(__test.registeredProjectCount()).toBe(1);

		// Calling with fallbackOpts for an already-registered project
		// should reuse the existing registration, not create a duplicate.
		const fallbackOpts = {
			...opts,
			embeddingConfig: { provider: "off" as const },
			memoryEnabled: true,
		};

		// Returns null (empty queue) but does NOT throw "not registered"
		const result = await runPiDreamForProject(projectIdentity, fallbackOpts);
		expect(result).toBeNull();

		// Still only one registration
		expect(__test.registeredProjectCount()).toBe(1);
	});
});
