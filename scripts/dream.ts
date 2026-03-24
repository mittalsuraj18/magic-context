#!/usr/bin/env bun

// Usage: bun scripts/dream.ts [--project-path <path>] [--tasks consolidate,verify]

import path from "node:path";
import { loadPluginConfig } from "../src/config";
import { MagicContextConfigSchema } from "../src/config/schema/magic-context";
import { resolveProjectIdentity } from "../src/features/magic-context/memory";

interface ParsedArgs {
    projectPath: string;
    tasks?: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
    let projectPath = process.cwd();
    let tasks: string[] | undefined;

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === "--project-path") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("Missing value for --project-path");
            }
            projectPath = path.resolve(value);
            index += 1;
            continue;
        }

        if (arg === "--tasks") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("Missing value for --tasks");
            }
            tasks = value
                .split(",")
                .map((task) => task.trim())
                .filter((task) => task.length > 0);
            index += 1;
        }
    }

    return { projectPath, tasks };
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const pluginConfig = MagicContextConfigSchema.parse(loadPluginConfig(args.projectPath));
    const projectIdentity = resolveProjectIdentity(args.projectPath);
    const configuredTasks = args.tasks ?? pluginConfig.dreaming?.tasks ?? ["consolidate"];

    console.log(
        [
            "magic-context dream runner requires a live OpenCode server because dreaming now uses child sessions.",
            "",
            `project: ${projectIdentity}`,
            `tasks: ${configuredTasks.join(", ")}`,
            "",
            "Primary trigger path:",
            "  /ctx-dream",
            "",
            "This script is currently a thin wrapper/documentation entrypoint only.",
        ].join("\n"),
    );
}

main()
    .catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    })
    .finally(() => undefined);
