import type { Command } from "commander";

import { expect, test } from "vite-plus/test";

import { buildAtlass } from "#/cli/build.ts";
import { openTerminal } from "#/terminal/open.ts";

function command(opts: Record<string, unknown>, parent?: Command): Command {
	return { opts: () => opts, parent: parent ?? null } as unknown as Command;
}

test("a TTY with no flag gives a terminal that will prompt", () => {
	expect(openTerminal([{}, command({})], { isTTY: true }).interactive).toBe(true);
});

test("--no-input on the command itself turns prompting off", () => {
	expect(openTerminal([{}, command({ input: false })], { isTTY: true }).interactive).toBe(false);
});

test("--no-input on a parent command reaches the subcommand", () => {
	const root = command({ input: false });
	const leaf = command({}, root);
	expect(openTerminal([{}, leaf], { isTTY: true }).interactive).toBe(false);
});

test("a stdin that is not a TTY turns prompting off without any flag", () => {
	expect(openTerminal([{}, command({})], {}).interactive).toBe(false);
});

test("a flag value that happens to read --no-input does not turn prompting off", () => {
	const leaf = command({ summary: "--no-input" });
	expect(
		openTerminal(["--no-input", { summary: "--no-input" }, leaf], { isTTY: true }).interactive,
	).toBe(true);
});

test("a non-interactive terminal refuses to prompt and names the flag that would answer", async () => {
	const { ask } = openTerminal([{}, command({ input: false })], { isTTY: true });
	await expect(
		ask.text({ message: "Path to the issue Markdown file:", flag: "[file]" }),
	).rejects.toThrow("Cannot prompt without a terminal. Pass [file].");
	await expect(ask.confirm({ message: "Overwrite?" })).rejects.toThrow(
		"Cannot prompt without a terminal: Overwrite?",
	);
});

test("--no-input is accepted on every command, at any depth", () => {
	const root = buildAtlass();
	expect(root.options.some((o) => o.flags === "--no-input")).toBe(true);

	const without: string[] = [];
	function walk(cmd: Command): void {
		if (!cmd.options.some((o) => o.flags === "--no-input")) without.push(cmd.name());
		for (const sub of cmd.commands) walk(sub);
	}
	walk(root);
	expect(without).toEqual([]);
});
