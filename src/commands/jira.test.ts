import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import type { JiraComment, JiraIssue } from "../api/jira.ts";

import { formatIssueView, formatProjectRows, formatStatusRows } from "./jira.ts";

kleur.enabled = false;

test("projects: key column is padded so names align", () => {
	expect(
		formatProjectRows([
			{ key: "OPS", name: "Operations" },
			{ key: "PLATFORM", name: "Platform" },
		]),
	).toEqual(["OPS       Operations", "PLATFORM  Platform"]);
});

test("projects: a single row needs no extra padding", () => {
	expect(formatProjectRows([{ key: "OPS", name: "Operations" }])).toEqual(["OPS  Operations"]);
});

test("statuses: name column is padded so categories align", () => {
	expect(
		formatStatusRows([
			{ name: "To Do", category: "To Do" },
			{ name: "In Progress", category: "In Progress" },
		]),
	).toEqual(["To Do        To Do", "In Progress  In Progress"]);
});

test("statuses: a single row needs no extra padding", () => {
	expect(formatStatusRows([{ name: "Done", category: "Done" }])).toEqual(["Done  Done"]);
});

const NOW = Date.parse("2026-09-01T09:00:00.000Z");

function paragraph(text: string) {
	return {
		type: "doc",
		content: [{ type: "paragraph", content: [{ type: "text", text }] }],
	};
}

function comment(n: number): JiraComment {
	return { author: `Author ${n}`, created: "2026-08-20T10:00:00.000Z", body: paragraph(`c${n}`) };
}

function issue(overrides: Partial<JiraIssue> = {}): JiraIssue {
	return {
		key: "PROJ-123",
		url: "https://acme.atlassian.net/browse/PROJ-123",
		summary: "Fix login redirect loop",
		type: "Bug",
		status: "In Progress",
		statusCategory: "indeterminate",
		assignee: "Jane Doe",
		reporter: "Dan",
		priority: "High",
		labels: ["auth", "regression"],
		created: "2026-08-12T10:00:00.000Z",
		updated: "2026-08-30T10:00:00.000Z",
		description: paragraph("Redirect loops on Safari."),
		comments: [],
		attachments: [],
		...overrides,
	};
}

test("view: renders the header and aligned field block", () => {
	expect(formatIssueView(issue(), NOW, false)).toEqual([
		"PROJ-123  Fix login redirect loop",
		"Type:      Bug",
		"Status:    In Progress",
		"Assignee:  Jane Doe",
		"Reporter:  Dan",
		"Priority:  High",
		"Labels:    auth, regression",
		"Created:   2026-08-12 (19d ago)",
		"Updated:   2026-08-30 (1d ago)",
		"URL:       https://acme.atlassian.net/browse/PROJ-123",
		"",
		"Redirect loops on Safari.",
	]);
});

test("view: skips empty fields, description, comments, and attachments", () => {
	expect(
		formatIssueView(issue({ priority: "", labels: [], description: null }), NOW, false),
	).toEqual([
		"PROJ-123  Fix login redirect loop",
		"Type:      Bug",
		"Status:    In Progress",
		"Assignee:  Jane Doe",
		"Reporter:  Dan",
		"Created:   2026-08-12 (19d ago)",
		"Updated:   2026-08-30 (1d ago)",
		"URL:       https://acme.atlassian.net/browse/PROJ-123",
	]);
});

test("view: shows the last 5 comments with a hint about the rest", () => {
	const lines = formatIssueView(
		issue({ comments: [1, 2, 3, 4, 5, 6, 7].map(comment) }),
		NOW,
		false,
	);
	expect(lines).toContain("Comments (7, showing last 5 — --all-comments for all)");
	expect(lines).not.toContain("c2");
	expect(lines.filter((l) => l.startsWith("─ "))).toEqual([
		"─ Author 3 · 2026-08-20 10:00",
		"─ Author 4 · 2026-08-20 10:00",
		"─ Author 5 · 2026-08-20 10:00",
		"─ Author 6 · 2026-08-20 10:00",
		"─ Author 7 · 2026-08-20 10:00",
	]);
});

test("view: --all-comments shows every comment without the hint", () => {
	const lines = formatIssueView(
		issue({ comments: [1, 2, 3, 4, 5, 6, 7].map(comment) }),
		NOW,
		true,
	);
	expect(lines).toContain("Comments (7)");
	expect(lines).toContain("c1");
});

test("view: lists attachment filenames", () => {
	const lines = formatIssueView(
		issue({
			attachments: [{ mediaId: "m1", filename: "screenshot.png", url: "https://x/1" }],
		}),
		NOW,
		false,
	);
	expect(lines).toContain("Attachments");
	expect(lines).toContain("- screenshot.png");
});
