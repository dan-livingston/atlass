#!/usr/bin/env node
import { Command } from "commander";

import pkg from "../package.json" with { type: "json" };
import { login, logout, status } from "./commands/auth.ts";
import { confluenceCopy, confluenceSearch } from "./commands/confluence.ts";
import { jiraCopy, jiraSearch } from "./commands/jira.ts";

const program = new Command();

program
	.name("atlass")
	.description("Copy Jira issues and Confluence pages to Markdown.")
	.version(pkg.version);

const auth = program.command("auth").description("Manage Atlassian credentials");
auth.command("login").description("Store site, email, and API token").action(run(login));
auth.command("logout").description("Remove stored credentials").action(run(logout));
auth.command("status").description("Show the current login").action(run(status));

const jira = program.command("jira").description("Jira commands");
jira.command("copy [issue]")
	.description("Copy a Jira issue (key or URL) to a Markdown file")
	.option("-o, --out <path>", "output file or directory")
	.action(run(jiraCopy));
jira.command("search [query]")
	.description("Search Jira issues (text query, filters, or --jql)")
	.option("-p, --project <key>", "limit to a project")
	.option("-a, --assignee <who>", "limit to an assignee (or 'me')")
	.option("-s, --status <status>", "limit to a status")
	.option("--jql <jql>", "raw JQL query (ignores other filters)")
	.option("-l, --limit <n>", "max results (default 25, max 100)")
	.option("--json", "output results as JSON")
	.option("-c, --copy", "pick results to copy to Markdown")
	.option("-o, --out <dir>", "output directory for --copy")
	.action(run(jiraSearch));

const confluence = program.command("confluence").description("Confluence commands");
confluence
	.command("copy [page]")
	.description("Copy a Confluence page (id or URL) to a Markdown file")
	.option("-o, --out <path>", "output file or directory")
	.action(run(confluenceCopy));
confluence
	.command("search [query]")
	.description("Search Confluence pages (text query, --space, or --cql)")
	.option("-s, --space <key>", "limit to a space")
	.option("--cql <cql>", "raw CQL query (ignores other filters)")
	.option("-l, --limit <n>", "max results (default 25, max 100)")
	.option("--json", "output results as JSON")
	.option("-c, --copy", "pick results to copy to Markdown")
	.option("-o, --out <dir>", "output directory for --copy")
	.action(run(confluenceSearch));

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
