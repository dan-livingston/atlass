import type { Command } from "commander";

import { run } from "#/cli/run.ts";
import {
	confluenceCopy,
	confluenceList,
	confluenceSearch,
	confluenceUpdate,
	confluenceView,
} from "#/commands/confluence.ts";

export function registerConfluence(confluence: Command): Command {
	confluence.description("Confluence commands");
	confluence
		.command("view [page]")
		.description("Show a Confluence page (id or URL) in the terminal")
		.option("--all-comments", "show all comments instead of the last 5")
		.option("--no-pager", "print directly instead of paging long output")
		.action(run(confluenceView));
	confluence
		.command("copy [page]")
		.description("Copy a Confluence page (id or URL) to a Markdown file")
		.option("-o, --out <path>", "output file or directory")
		.action(run(confluenceCopy));
	confluence
		.command("update [file]")
		.description("Update a Confluence page from an edited Markdown file")
		.option("--title", "also push the H1 as the page title")
		.option("-m, --message <text>", "version message (default 'Updated via atlass')")
		.option("-f, --force", "skip the stale-version and data-loss checks")
		.option("--dry-run", "show what would change without writing")
		.action(run(confluenceUpdate));
	confluence
		.command("list")
		.description("List pages you starred")
		.option("-s, --space <key>", "limit to a space")
		.option("-l, --limit <n>", "max results (default 25, max 100)")
		.option("--json", "output results as JSON")
		.option("-c, --copy", "pick results to copy to Markdown")
		.option("-o, --out <dir>", "output directory for --copy")
		.action(run(confluenceList));
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
	return confluence;
}
