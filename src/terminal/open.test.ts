import type { Command } from "commander";

import { expect, test } from "vite-plus/test";

import { buildAtlass } from "#/cli/build.ts";
import { openTerminal } from "#/terminal/open.ts";

test("a TTY with no flag gives a terminal that will prompt", () => {
	expect(openTerminal(["node", "atlass", "jira", "view"], { isTTY: true }).interactive).toBe(
		true,
	);
});

test("--no-input anywhere in the argv turns prompting off", () => {
	const term = openTerminal(["node", "atlass", "jira", "update", "--no-input"], { isTTY: true });
	expect(term.interactive).toBe(false);
});

test("a stdin that is not a TTY turns prompting off without any flag", () => {
	expect(openTerminal(["node", "atlass", "jira", "update"], {}).interactive).toBe(false);
});

test("a non-interactive terminal refuses to prompt and names the flag that would answer", async () => {
	const { ask } = openTerminal(["node", "atlass", "--no-input"], { isTTY: true });
	await expect(
		ask.text({ message: "Path to the issue Markdown file:", flag: "[file]" }),
	).rejects.toThrow("Cannot prompt without a terminal. Pass [file].");
	await expect(ask.confirm({ message: "Overwrite?" })).rejects.toThrow(
		"Cannot prompt without a terminal: Overwrite?",
	);
});

test("--no-input reaches every leaf command, not just jira create", () => {
	const leaves: string[] = [];
	function walk(cmd: Command): void {
		if (cmd.commands.length === 0 && cmd.options.some((o) => o.flags === "--no-input")) {
			leaves.push(cmd.name());
		}
		for (const sub of cmd.commands) walk(sub);
	}
	walk(buildAtlass());
	expect(leaves).toContain("create");
	expect(leaves).toContain("update");
	expect(leaves).toContain("login");
	expect(leaves.length).toBeGreaterThan(15);
});
