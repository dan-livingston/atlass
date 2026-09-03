import type { Command } from "commander";

import { run, withJira } from "#/cli/run.ts";
import { jiraCreate, jiraFields } from "#/commands/jira-create.ts";
import { jiraList, jiraSearch } from "#/commands/jira-search.ts";
import { jiraCopy, jiraProjects, jiraStatuses, jiraUpdate, jiraView } from "#/commands/jira.ts";

function collect(value: string, previous: string[] = []): string[] {
	return [...previous, value];
}

export function registerJira(jira: Command): Command {
	jira.description("Jira commands");
	jira.command("projects [query]")
		.description("List projects (optionally filtered by key or name)")
		.option("--json", "output results as JSON")
		.action(run(withJira(jiraProjects)));
	jira.command("statuses [query]")
		.description("List statuses (optionally filtered by name, scoped with --project)")
		.option("-p, --project <key>", "limit to statuses used by a project")
		.option("--json", "output results as JSON")
		.action(run(withJira(jiraStatuses)));
	jira.command("create [project] [type]")
		.description("Create a Jira issue, prompting for fields or taking them all as flags")
		.option("-s, --summary <text>", "issue summary")
		.option("-d, --description <markdown>", "description as Markdown")
		.option("--description-file <path>", "read the description from a Markdown file")
		.option("-a, --assignee <who>", "assignee: me, an account id, or a name to look up")
		.option("--priority <name>", "priority name")
		.option("-l, --label <label>", "label (repeatable, or comma separated)", collect)
		.option("-c, --component <name>", "component (repeatable, or comma separated)", collect)
		.option("--parent <key>", "parent issue key for subtasks")
		.option("-f, --field <name=value>", "any other create-screen field (repeatable)", collect)
		.option("--dry-run", "print the resolved payload instead of creating")
		.option("--json", "print the created issue as JSON")
		.action(run(withJira(jiraCreate)));
	jira.command("fields <project> [type]")
		.description(
			"Show the issue types you can create in a project, or the create form for one type",
		)
		.option("--json", "output results as JSON")
		.action(run(withJira(jiraFields)));
	jira.command("view [issue]")
		.description("Show a Jira issue (key or URL) in the terminal")
		.option("--all-comments", "show all comments instead of the last 5")
		.option("--no-pager", "print directly instead of paging long output")
		.action(run(withJira(jiraView)));
	jira.command("copy [issue]")
		.description("Copy a Jira issue (key or URL) to a Markdown file")
		.option("-o, --out <path>", "output file or directory")
		.action(run(withJira(jiraCopy)));
	jira.command("update [file]")
		.description("Update a Jira issue description from an edited Markdown file")
		.option("--summary", "also push the H1 as the issue summary")
		.option("-f, --force", "skip the stale-issue and data-loss checks")
		.option("--dry-run", "show what would change without writing")
		.action(run(withJira(jiraUpdate)));
	jira.command("list")
		.description("List open issues assigned to you")
		.option("-p, --project <key>", "limit to a project")
		.option("-a, --all", "include Done issues updated in the last 30 days")
		.option("--json", "output results as JSON")
		.option("-c, --copy", "pick results to copy to Markdown")
		.option("-o, --out <dir>", "output directory for --copy")
		.action(run(withJira(jiraList)));
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
		.action(run(withJira(jiraSearch)));
	return jira;
}
