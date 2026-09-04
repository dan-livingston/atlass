import type { Command } from "commander";

import { jiraAction } from "#/cli/run.ts";
import { collect, moved, outputOptions } from "#/cli/search-options.ts";
import { jiraCreate, jiraFields } from "#/commands/jira-create.ts";
import { jiraJql, jiraList, jiraSearch } from "#/commands/jira-search.ts";
import { jiraCopy, jiraProjects, jiraStatuses, jiraUpdate, jiraView } from "#/commands/jira.ts";

export function registerJira(jira: Command): Command {
	jira.description("Jira commands");
	jira.command("projects [query]")
		.description("List projects (optionally filtered by key or name)")
		.option("--json", "output results as JSON")
		.action(jiraAction(jiraProjects));
	jira.command("statuses [query]")
		.description("List statuses (optionally filtered by name, scoped with --project)")
		.option("-p, --project <key>", "limit to statuses used by a project")
		.option("--json", "output results as JSON")
		.action(jiraAction(jiraStatuses));
	jira.command("create [project] [type]")
		.description("Create a Jira issue, prompting for fields or taking them all as flags")
		.option("-s, --summary <text>", "issue summary")
		.option("-d, --description <markdown>", "description as Markdown")
		.option("--description-file <path>", "read the description from a Markdown file")
		.option("-a, --assignee <who>", "assignee: me, an account id, or a name to look up")
		.option("--priority <name>", "priority name")
		.option("-l, --label <label>", "label (repeatable)", collect)
		.option("-c, --component <name>", "component (repeatable)", collect)
		.option("--parent <key>", "parent issue key for subtasks")
		.option("-f, --field <name=value>", "any other create-screen field (repeatable)", collect)
		.option("--dry-run", "print the resolved payload instead of creating")
		.option("--json", "print the created issue as JSON")
		.action(jiraAction(jiraCreate));
	jira.command("fields <project> [type]")
		.description(
			"Show the issue types you can create in a project, or the create form for one type",
		)
		.option("--json", "output results as JSON")
		.action(jiraAction(jiraFields));
	jira.command("view [issue]")
		.description("Show a Jira issue (key or URL) in the terminal")
		.option("--all-comments", "show all comments instead of the last 5")
		.option("--no-pager", "print directly instead of paging long output")
		.action(jiraAction(jiraView));
	jira.command("copy [issue]")
		.description("Copy a Jira issue (key or URL) to a Markdown file")
		.option("-o, --out <path>", "output file or directory")
		.action(jiraAction(jiraCopy));
	jira.command("update [file]")
		.description("Update a Jira issue description from an edited Markdown file")
		.option("--summary", "also push the H1 as the issue summary")
		.option("-f, --force", "skip the stale-issue and data-loss checks")
		.option("--dry-run", "show what would change without writing")
		.action(jiraAction(jiraUpdate));
	outputOptions(
		jira
			.command("list")
			.description("List open issues assigned to you")
			.option("-p, --project <key>", "limit to a project")
			.option("-a, --all", "include Done issues updated in the last 30 days"),
	).action(jiraAction(jiraList));
	outputOptions(
		jira
			.command("search [query]")
			.description("Search Jira issues by text and filters")
			.option("-p, --project <key>", "limit to a project (repeatable)", collect)
			.option(
				"-a, --assignee <who>",
				"limit to an assignee: me, a name, or an account id",
				collect,
			)
			.option(
				"--reporter <who>",
				"limit to a reporter: me, a name, or an account id",
				collect,
			)
			.option("-s, --status <status>", "limit to a status (repeatable)", collect)
			.option("-t, --type <type>", "limit to an issue type (repeatable)", collect)
			.option("--label <label>", "limit to a label (repeatable)", collect)
			.option("-u, --updated <when>", "changed since 7d, 2w, 3m, or YYYY-MM-DD")
			.option("--open", "exclude issues in the Done category")
			.addOption(moved("--jql <jql>", "jira jql")),
	).action(jiraAction(jiraSearch));
	outputOptions(
		jira.command("jql <query>").description("Search Jira issues with a raw JQL query"),
	).action(jiraAction(jiraJql));
	return jira;
}
