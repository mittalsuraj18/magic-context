import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

function getInput(): NodeJS.ReadableStream {
    // When piped (curl | bash), stdin is consumed by the pipe.
    // Open /dev/tty directly to read from the actual terminal.
    if (!process.stdin.isTTY) {
        try {
            return createReadStream("/dev/tty");
        } catch {
            // Windows or no TTY available — fall back to stdin
        }
    }
    return process.stdin;
}

const rl = createInterface({ input: getInput(), output: process.stdout });

function ask(question: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()));
    });
}

export function closePrompts(): void {
    rl.close();
}

export async function confirm(message: string, defaultYes = true): Promise<boolean> {
    const hint = defaultYes ? "Y/n" : "y/N";
    const answer = await ask(`  ${message} [${hint}] `);
    if (answer === "") return defaultYes;
    return answer.toLowerCase().startsWith("y");
}

export async function selectOne(
    message: string,
    options: { label: string; value: string; recommended?: boolean }[],
): Promise<string> {
    console.log(`  ${message}`);
    console.log("");
    for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const rec = opt.recommended ? " (recommended)" : "";
        const num = `${i + 1}`.padStart(3);
        console.log(`  ${num}) ${opt.label}${rec}`);
    }
    console.log("");

    while (true) {
        const answer = await ask("  Enter number: ");
        const idx = Number.parseInt(answer, 10) - 1;
        if (idx >= 0 && idx < options.length) {
            return options[idx].value;
        }
        console.log("  Invalid selection, try again.");
    }
}

export async function selectMultiple(
    message: string,
    options: { label: string; value: string }[],
): Promise<string[]> {
    console.log(`  ${message}`);
    console.log("");
    for (let i = 0; i < options.length; i++) {
        const num = `${i + 1}`.padStart(3);
        console.log(`  ${num}) ${options[i].label}`);
    }
    console.log("");

    const answer = await ask("  Enter numbers (comma-separated, or 'none'): ");
    if (answer.toLowerCase() === "none" || answer === "") return [];

    const indices = answer.split(",").map((s) => Number.parseInt(s.trim(), 10) - 1);
    return indices.filter((i) => i >= 0 && i < options.length).map((i) => options[i].value);
}
