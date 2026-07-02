#!/usr/bin/env node
import { Command } from "commander";

import pkg from "../package.json" with { type: "json" };
import { login, logout, status } from "./commands/auth.ts";
import { confluenceCopy } from "./commands/confluence.ts";
import { jiraCopy } from "./commands/jira.ts";

const program = new Command();

program
	.name("atlass")
	.description("Copy Jira issues and Confluence pages to Markdown.")
	.version(pkg.version);

const auth = program.command("auth").description("Manage Atlassian credentials");
auth.command("login").description("Store site, email, and API token").action(run(login));
auth.command("logout").description("Remove stored credentials").action(run(logout));
auth.command("status").description("Show the current login").action(run(status));

program
	.command("jira")
	.description("Jira commands")
	.command("copy [issue]")
	.description("Copy a Jira issue (key or URL) to a Markdown file")
	.option("-o, --out <path>", "output file or directory")
	.action(run(jiraCopy));

program
	.command("confluence")
	.description("Confluence commands")
	.command("copy [page]")
	.description("Copy a Confluence page (id or URL) to a Markdown file")
	.option("-o, --out <path>", "output file or directory")
	.action(run(confluenceCopy));

program.parseAsync().catch(fail);

// Wrap a command action so errors print cleanly and exit non-zero.
function run<A extends unknown[]>(
	fn: (...args: A) => Promise<void>,
): (...args: A) => Promise<void> {
	return async (...args: A) => {
		try {
			await fn(...args);
		} catch (err) {
			fail(err);
		}
	};
}

function fail(err: unknown): never {
	// a clean Ctrl+C out of an inquirer prompt should not look like a crash
	if (err instanceof Error && err.name === "ExitPromptError") process.exit(130);
	console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
}
