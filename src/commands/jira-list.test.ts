import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import { jiraList } from "#/commands/jira-search.ts";
import { fakeJiraEnv, routed } from "#/test/env.ts";

kleur.enabled = false;

const JQL = "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";
const PAGE = `/rest/api/3/search/jql?${new URLSearchParams({
	jql: JQL,
	maxResults: "100",
	fields: "summary,status,updated",
}).toString()}`;

function issue(key: string, category: string, hoursAgo: number) {
	return {
		key,
		fields: {
			summary: `Summary ${key}`,
			status: { name: category, statusCategory: { key: category } },
			updated: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
		},
	};
}

function listEnv() {
	return fakeJiraEnv({
		getJson: routed({
			[PAGE]: {
				issues: [
					issue("PROJ-1", "new", 1),
					issue("PROJ-2", "indeterminate", 2),
					issue("PROJ-3", "new", 3),
					issue("PROJ-4", "indeterminate", 4),
				],
				isLast: true,
			},
		}),
	});
}

test("list --limit: keeps the first rows after sorting in progress ahead of to do", async () => {
	const env = listEnv();
	await jiraList(env, { limit: "2", json: true });

	const rows = env.term.emitted[0] as { key: string }[];
	expect(rows.map((r) => r.key)).toEqual(["PROJ-2", "PROJ-4"]);
});

test("list --limit: says more issues are hidden", async () => {
	const env = listEnv();
	await jiraList(env, { limit: "3" });

	expect(env.term.written.at(-1)).toContain(
		"Showing first 3; refine with flags or raise --limit.",
	);
});

test("list: without --limit shows every issue", async () => {
	const env = listEnv();
	await jiraList(env, { json: true });

	expect((env.term.emitted[0] as unknown[]).length).toBe(4);
});
