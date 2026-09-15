import { expect, test } from "vite-plus/test";

import type { AdfNode } from "#/adf/types.ts";
import type { JiraIssue } from "#/api/jira-types.ts";
import type { IssueSource } from "#/markdown/copied-document.ts";

import { formatPlan, planIssueUpdate } from "#/update/plan.ts";

function paragraph(text: string): AdfNode {
	return { type: "paragraph", content: [{ type: "text", text }] };
}

function doc(...content: AdfNode[]): AdfNode {
	return { type: "doc", content };
}

function issueSource(over: Partial<IssueSource> = {}): IssueSource {
	return {
		fields: { key: "PROJ-1", updated: "2026-08-30T10:00:00.000Z" },
		title: "Fix login",
		body: "New body.",
		key: "PROJ-1",
		updatedAtCopy: "2026-08-30T10:00:00.000Z",
		...over,
	};
}

function issue(over: Partial<JiraIssue> = {}): JiraIssue {
	return {
		key: "PROJ-1",
		url: "https://acme.atlassian.net/browse/PROJ-1",
		summary: "Fix login",
		type: "Bug",
		status: "To Do",
		statusCategory: "new",
		assignee: "Unassigned",
		reporter: "",
		priority: "",
		labels: [],
		created: "2026-08-12T10:00:00.000Z",
		updated: "2026-08-30T10:00:00.000Z",
		description: doc(paragraph("Old body.")),
		comments: [],
		attachments: [],
		...over,
	};
}

test("issue: an unchanged, edit-only file proceeds with the converted body", () => {
	const plan = planIssueUpdate(issueSource(), issue(), {});
	expect(plan.verdict).toEqual({ kind: "proceed" });
	expect(plan.body).toEqual({ type: "doc", version: 1, content: [paragraph("New body.")] });
	expect(plan.headline).toEqual({ label: "summary", current: "Fix login", next: "Fix login" });
	expect(plan.revision.stale).toBe(false);
	expect(plan.uploads).toEqual([]);
});

test("issue: --summary pushes the H1 only when it differs", () => {
	const plan = planIssueUpdate(issueSource({ title: "Fix login loop" }), issue(), {
		summary: true,
	});
	expect(plan.headline).toEqual({
		label: "summary",
		current: "Fix login",
		next: "Fix login loop",
	});
	expect(
		planIssueUpdate(issueSource({ title: "Fix login loop" }), issue(), {}).headline.next,
	).toBe("Fix login");
});

test("issue: a server change since the copy refuses unless forced", () => {
	const server = issue({ updated: "2026-09-01T10:00:00.000Z" });
	const plan = planIssueUpdate(issueSource(), server, {});
	expect(plan.revision).toEqual({
		local: "2026-08-30T10:00:00.000Z",
		server: "2026-09-01T10:00:00.000Z",
		stale: true,
	});
	expect(plan.verdict).toEqual({
		kind: "refuse",
		message:
			"Issue changed on the server since you copied it (copied at 2026-08-30T10:00:00.000Z, " +
			"server now 2026-09-01T10:00:00.000Z). Re-copy the issue or pass --force.",
	});
	expect(planIssueUpdate(issueSource(), server, { force: true }).verdict).toEqual({
		kind: "proceed",
	});
});

test("issue: a copy with no recorded revision reads as unknown", () => {
	const plan = planIssueUpdate(issueSource({ updatedAtCopy: "" }), issue(), {});
	expect(plan.revision).toEqual({
		local: "unknown",
		server: "2026-08-30T10:00:00.000Z",
		stale: true,
	});
	expect(
		planIssueUpdate(issueSource({ updatedAtCopy: "" }), issue({ updated: "" }), {}).revision
			.stale,
	).toBe(false);
});

test("issue: lossy content on the server asks for confirmation unless forced", () => {
	const server = issue({
		description: doc(
			{ type: "panel", attrs: { panelType: "info" }, content: [paragraph("note")] },
			{ type: "mediaSingle", content: [{ type: "media", attrs: { id: "m1" } }] },
		),
	});
	const plan = planIssueUpdate(issueSource(), server, {});
	expect(plan.lossy).toEqual(
		new Map([
			["panel", 1],
			["image", 1],
		]),
	);
	expect(plan.verdict).toEqual({
		kind: "confirm",
		message:
			"This issue contains 1 panel, 1 image that Markdown cannot represent and will be " +
			"removed. Continue?",
	});
	expect(planIssueUpdate(issueSource(), server, { force: true }).verdict).toEqual({
		kind: "proceed",
	});
});

test("issue: local images are unsupported and refuse even with --force", () => {
	const src = issueSource({
		body: "See ![shot](x.assets/shot.png) and ![logo](https://cdn/logo.png)",
	});
	const plan = planIssueUpdate(src, issue(), { force: true });
	expect(plan.images).toEqual([
		{ href: "x.assets/shot.png", kind: "unsupported" },
		{ href: "https://cdn/logo.png", kind: "external" },
	]);
	expect(plan.verdict).toEqual({
		kind: "refuse",
		message:
			"jira update does not support image changes yet. Remove local image reference(s) " +
			"or edit text only: x.assets/shot.png",
	});
});

test("issue: an empty converted body is refused, and refusals are joined", () => {
	const plan = planIssueUpdate(issueSource({ body: "![shot](shot.png)" }), issue(), {});
	expect(plan.verdict).toEqual({
		kind: "refuse",
		message:
			"jira update does not support image changes yet. Remove local image reference(s) " +
			"or edit text only: shot.png\n" +
			"Refusing to update: the converted body is empty.",
	});
});

test("issue: dry run lines cover headline, images, blockers, lossy and staleness", () => {
	const src = issueSource({
		title: "Fix login loop",
		body: "![a](https://cdn/a.png) and ![b](b.png)",
	});
	const server = issue({
		updated: "2026-09-01T10:00:00.000Z",
		description: doc({ type: "expand", content: [paragraph("x")] }),
	});
	expect(formatPlan(planIssueUpdate(src, server, { summary: true }))).toEqual([
		'Dry run for issue PROJ-1 "Fix login"',
		'  summary: "Fix login" -> "Fix login loop"',
		"  images:  1 external, 1 unsupported",
		"  blocked: jira update does not support image changes yet. Remove local image " +
			"reference(s) or edit text only: b.png",
		"  warning: 1 expand will be removed",
		"  stale:   copied at 2026-08-30T10:00:00.000Z, server now 2026-09-01T10:00:00.000Z " +
			"(would refuse without --force)",
		"  nothing was written (dry run)",
	]);
});

test("issue: dry run warns about HTML that will be dropped or sent as text", () => {
	const src = issueSource({ body: "New <b>body</b>.\n\n<div>gone</div>\n\n<!-- note -->" });
	expect(formatPlan(planIssueUpdate(src, issue(), {}))).toEqual([
		'Dry run for issue PROJ-1 "Fix login"',
		"  warning: 1 HTML block will be dropped",
		"  warning: 2 inline HTML tags will be sent as text",
		"  nothing was written (dry run)",
	]);
});

test("issue: a clean dry run prints only the header and footer", () => {
	expect(formatPlan(planIssueUpdate(issueSource(), issue(), {}))).toEqual([
		'Dry run for issue PROJ-1 "Fix login"',
		"  nothing was written (dry run)",
	]);
});
