import { expect, test } from "vite-plus/test";

import type { AdfNode } from "#/adf/types.ts";
import type { AttachmentInfo, PageState } from "#/api/confluence.ts";
import type { JiraIssue } from "#/api/jira-types.ts";
import type { IssueSource, PageSource } from "#/markdown/copied-document.ts";
import type { LocalImage } from "#/update/plan.ts";

import { formatPlan, planIssueUpdate, planPageUpdate, withUploadedIds } from "#/update/plan.ts";

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

test("issue: a clean dry run prints only the header and footer", () => {
	expect(formatPlan(planIssueUpdate(issueSource(), issue(), {}))).toEqual([
		'Dry run for issue PROJ-1 "Fix login"',
		"  nothing was written (dry run)",
	]);
});

function pageSource(over: Partial<PageSource> = {}): PageSource {
	return {
		fields: { id: "123", version: 7 },
		title: "My Page",
		body: "New body.",
		id: "123",
		version: 7,
		...over,
	};
}

function pageState(over: Partial<PageState> = {}): PageState {
	return { version: 7, title: "My Page", body: doc(paragraph("Old body.")), ...over };
}

function attachment(filename: string, fileId: string, size: number): AttachmentInfo {
	return { filename, fileId, size };
}

function local(href: string, size?: number): LocalImage {
	const image: LocalImage = {
		href,
		path: `/docs/${href}`,
		filename: href.split("/").pop() ?? "",
	};
	return size === undefined ? image : { ...image, size };
}

function media(attrs: Record<string, unknown>): AdfNode {
	return {
		type: "mediaSingle",
		attrs: { layout: "center" },
		content: [{ type: "media", attrs }],
	};
}

test("page: an unchanged, edit-only file proceeds and --title pushes the H1", () => {
	const plan = planPageUpdate(pageSource({ title: "Renamed" }), pageState(), [], [], {
		title: true,
	});
	expect(plan.verdict).toEqual({ kind: "proceed" });
	expect(plan.noun).toBe("page");
	expect(plan.headline).toEqual({ label: "title", current: "My Page", next: "Renamed" });
	expect(plan.revision).toEqual({ local: "v7", server: "v7", stale: false });
	expect(plan.body).toEqual({ type: "doc", version: 1, content: [paragraph("New body.")] });
});

test("page: a newer server version refuses unless forced", () => {
	const plan = planPageUpdate(pageSource(), pageState({ version: 9 }), [], [], {});
	expect(plan.verdict).toEqual({
		kind: "refuse",
		message:
			"Page changed on the server since you copied it (copied at v7, server now v9). " +
			"Re-copy the page or pass --force.",
	});
});

test("page: lossy content on the server asks for confirmation and an empty body is refused", () => {
	const state = pageState({
		body: doc({ type: "layoutSection", content: [paragraph("cols")] }),
	});
	expect(planPageUpdate(pageSource(), state, [], [], {}).verdict).toEqual({
		kind: "confirm",
		message:
			"This page contains 1 layout that Markdown cannot represent and will be removed. " +
			"Continue?",
	});
	expect(planPageUpdate(pageSource(), state, [], [], { force: true }).verdict).toEqual({
		kind: "proceed",
	});
	expect(planPageUpdate(pageSource({ body: "" }), pageState(), [], [], {}).verdict).toEqual({
		kind: "refuse",
		message: "Refusing to update: the converted body is empty.",
	});
});

test("page: images are reused when name and size match, uploaded otherwise, and left external", () => {
	const src = pageSource({
		body: [
			"![same](p.assets/same.png)",
			"![grown](p.assets/grown.png)",
			"![fresh](p.assets/fresh.png)",
			"![logo](https://cdn/logo.png)",
		].join("\n\n"),
	});
	const attachments = [
		attachment("same.png", "f-same", 10),
		attachment("grown.png", "f-grown", 10),
	];
	const locals = [
		local("p.assets/same.png", 10),
		local("p.assets/grown.png", 11),
		local("p.assets/fresh.png", 5),
	];
	const plan = planPageUpdate(src, pageState(), attachments, locals, {});
	expect(plan.images).toEqual([
		{ href: "p.assets/same.png", kind: "reuse" },
		{ href: "p.assets/grown.png", kind: "changed" },
		{ href: "p.assets/fresh.png", kind: "upload" },
		{ href: "https://cdn/logo.png", kind: "external" },
	]);
	expect(plan.uploads).toEqual([
		{ href: "p.assets/grown.png", path: "/docs/p.assets/grown.png", filename: "grown.png" },
		{ href: "p.assets/fresh.png", path: "/docs/p.assets/fresh.png", filename: "fresh.png" },
	]);
	expect(plan.body.content).toEqual([
		media({ type: "file", id: "f-same", collection: "contentId-123", alt: "same" }),
		media({
			type: "file",
			id: "p.assets/grown.png",
			collection: "contentId-123",
			alt: "grown",
		}),
		media({
			type: "file",
			id: "p.assets/fresh.png",
			collection: "contentId-123",
			alt: "fresh",
		}),
		media({ type: "external", url: "https://cdn/logo.png", alt: "logo" }),
	]);
	expect(plan.verdict).toEqual({ kind: "proceed" });
});

test("page: a missing image file is refused even with --force", () => {
	const src = pageSource({ body: "Text.\n\n![gone](p.assets/gone.png)" });
	const plan = planPageUpdate(src, pageState(), [], [local("p.assets/gone.png")], {
		force: true,
	});
	expect(plan.images).toEqual([{ href: "p.assets/gone.png", kind: "missing" }]);
	expect(plan.verdict).toEqual({
		kind: "refuse",
		message: "Image file(s) not found: p.assets/gone.png",
	});
	expect(plan.body.content).toEqual([paragraph("Text.")]);
});

test("page: dry run lines count images by kind", () => {
	const src = pageSource({
		body: "![same](p.assets/same.png) ![fresh](p.assets/fresh.png) ![logo](https://cdn/logo.png)",
	});
	const plan = planPageUpdate(
		src,
		pageState({ version: 8 }),
		[attachment("same.png", "f-same", 10)],
		[local("p.assets/same.png", 10), local("p.assets/fresh.png", 5)],
		{},
	);
	expect(formatPlan(plan)).toEqual([
		'Dry run for page 123 "My Page"',
		"  images:  1 new, 1 reused, 1 external",
		"  stale:   copied at v7, server now v8 (would refuse without --force)",
		"  nothing was written (dry run)",
	]);
});

test("withUploadedIds swaps placeholder ids for uploaded file ids, wherever media sits", () => {
	const body = {
		type: "doc" as const,
		version: 1 as const,
		content: [
			media({ type: "file", id: "p.assets/fresh.png", collection: "c" }),
			{
				type: "bulletList",
				content: [
					{
						type: "listItem",
						content: [
							media({ type: "file", id: "p.assets/other.png", collection: "c" }),
						],
					},
				],
			},
			media({ type: "file", id: "f-same", collection: "c" }),
		],
	};
	const swapped = withUploadedIds(body, new Map([["p.assets/fresh.png", "f-fresh"]]));
	expect(swapped.content).toEqual([
		media({ type: "file", id: "f-fresh", collection: "c" }),
		{
			type: "bulletList",
			content: [
				{
					type: "listItem",
					content: [media({ type: "file", id: "p.assets/other.png", collection: "c" })],
				},
			],
		},
		media({ type: "file", id: "f-same", collection: "c" }),
	]);
	expect(body.content[0]).toEqual(
		media({ type: "file", id: "p.assets/fresh.png", collection: "c" }),
	);
});
