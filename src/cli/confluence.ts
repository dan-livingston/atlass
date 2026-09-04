import type { Command } from "commander";

import { jiraAction } from "#/cli/run.ts";
import { collect, moved, outputOptions } from "#/cli/search-options.ts";
import { confluenceCql, confluenceList, confluenceSearch } from "#/commands/confluence-search.ts";
import { confluenceCopy, confluenceUpdate, confluenceView } from "#/commands/confluence.ts";

export function registerConfluence(confluence: Command): Command {
	confluence.description("Confluence commands");
	confluence
		.command("view [page]")
		.description("Show a Confluence page (id or URL) in the terminal")
		.option("--all-comments", "show all comments instead of the last 5")
		.option("--no-pager", "print directly instead of paging long output")
		.action(jiraAction(confluenceView));
	confluence
		.command("copy [page]")
		.description("Copy a Confluence page (id or URL) to a Markdown file")
		.option("-o, --out <path>", "output file or directory")
		.action(jiraAction(confluenceCopy));
	confluence
		.command("update [file]")
		.description("Update a Confluence page from an edited Markdown file")
		.option("--title", "also push the H1 as the page title")
		.option("-m, --message <text>", "version message (default 'Updated via atlass')")
		.option("-f, --force", "skip the stale-version and data-loss checks")
		.option("--dry-run", "show what would change without writing")
		.action(jiraAction(confluenceUpdate));
	outputOptions(
		confluence
			.command("list")
			.description("List pages you starred")
			.option("-s, --space <key>", "limit to a space"),
	).action(jiraAction(confluenceList));
	outputOptions(
		confluence
			.command("search [query]")
			.description("Search Confluence pages by text and filters")
			.option("-s, --space <key>", "limit to a space (repeatable)", collect)
			.option("--label <label>", "limit to a label (repeatable)", collect)
			.option("--starred", "limit to pages you starred")
			.option("-u, --updated <when>", "changed since 7d, 2w, 3m, or YYYY-MM-DD")
			.addOption(moved("--cql <cql>", "confluence cql")),
	).action(jiraAction(confluenceSearch));
	outputOptions(
		confluence
			.command("cql <query>")
			.description("Search Confluence pages with a raw CQL query"),
	).action(jiraAction(confluenceCql));
	return confluence;
}
