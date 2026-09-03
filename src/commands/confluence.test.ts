import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import type { ConfluenceComment, ConfluencePage } from "#/api/confluence-pages.ts";

import { formatPageRows, formatPageView } from "#/commands/confluence.ts";

const NOW = Date.parse("2026-08-31T10:00:00.000Z");

function page(overrides: Partial<Parameters<typeof formatPageRows>[0][number]> = {}) {
	return {
		id: "1347354627",
		space: "DOCS",
		title: "Green Bar",
		updated: "2026-08-30T10:00:00.000Z",
		url: "https://x/1",
		...overrides,
	};
}

test("pages: id, space, and age columns are padded so titles align", () => {
	kleur.enabled = false;
	const rows = formatPageRows(
		[
			page(),
			page({
				id: "931692546",
				space: "ENGINEERING",
				title: "Build Workflow",
				updated: "2026-08-12T10:00:00.000Z",
				url: "https://x/2",
			}),
		],
		NOW,
	);
	expect(rows.map((r) => r.fixedColumns)).toEqual([
		"1347354627  DOCS         1d ago ",
		"931692546   ENGINEERING  19d ago",
	]);
	expect(rows.map((r) => r.freeText)).toEqual(["Green Bar", "Build Workflow"]);
	expect(rows.map((r) => r.id)).toEqual(["1347354627", "931692546"]);
});

test("pages: json carries the fetched fields", () => {
	kleur.enabled = false;
	expect(formatPageRows([page()], NOW)[0]?.json).toEqual({
		id: "1347354627",
		space: "DOCS",
		title: "Green Bar",
		updated: "2026-08-30T10:00:00.000Z",
		url: "https://x/1",
	});
});

test("pages: a space keeps its color across runs, is never red, and differs from its neighbour", () => {
	kleur.enabled = true;
	const codes = (row: string | undefined) => row?.match(/\[(\d+)m/g) ?? [];
	const first = formatPageRows([page(), page({ space: "ENGINEERING" })], NOW);
	const again = formatPageRows([page({ space: "ENGINEERING" }), page()], NOW);
	kleur.enabled = false;
	expect(codes(first[0]?.fixedColumns)).toEqual(codes(again[1]?.fixedColumns));
	expect(codes(first[0]?.fixedColumns)).not.toHaveLength(0);
	expect(codes(first[0]?.fixedColumns)).not.toContain("[31m");
	expect(codes(first[0]?.fixedColumns)).not.toEqual(codes(first[1]?.fixedColumns));
});

const VIEW_NOW = Date.parse("2026-09-01T09:00:00.000Z");

function paragraph(text: string) {
	return {
		type: "doc",
		content: [{ type: "paragraph", content: [{ type: "text", text }] }],
	};
}

function pageComment(n: number): ConfluenceComment {
	return { author: `Author ${n}`, created: "2026-08-20T10:00:00.000Z", body: paragraph(`c${n}`) };
}

function fullPage(overrides: Partial<ConfluencePage> = {}): ConfluencePage {
	return {
		id: "123456",
		title: "Onboarding guide",
		spaceKey: "DOCS",
		version: 7,
		author: "Jane Doe",
		createdAt: "2026-08-12T10:00:00.000Z",
		updatedAt: "2026-08-30T10:00:00.000Z",
		url: "https://acme.atlassian.net/wiki/spaces/DOCS/pages/123456/Onboarding+guide",
		body: paragraph("Welcome aboard."),
		attachments: [],
		comments: [],
		...overrides,
	};
}

test("view: renders the title and aligned field block", () => {
	expect(formatPageView(fullPage(), VIEW_NOW, false)).toEqual([
		"Onboarding guide",
		"Space:    DOCS",
		"ID:       123456",
		"Version:  7",
		"Author:   Jane Doe",
		"Created:  2026-08-12 (19d ago)",
		"Updated:  2026-08-30 (1d ago)",
		"URL:      https://acme.atlassian.net/wiki/spaces/DOCS/pages/123456/Onboarding+guide",
		"",
		"Welcome aboard.",
	]);
});

test("view: skips empty fields and body", () => {
	expect(
		formatPageView(fullPage({ spaceKey: "", author: "", body: null }), VIEW_NOW, false),
	).toEqual([
		"Onboarding guide",
		"ID:       123456",
		"Version:  7",
		"Created:  2026-08-12 (19d ago)",
		"Updated:  2026-08-30 (1d ago)",
		"URL:      https://acme.atlassian.net/wiki/spaces/DOCS/pages/123456/Onboarding+guide",
	]);
});

test("view: shows the last 5 comments unless --all-comments", () => {
	const comments = [1, 2, 3, 4, 5, 6, 7].map(pageComment);
	const some = formatPageView(fullPage({ comments }), VIEW_NOW, false);
	expect(some).toContain("Comments (7, showing last 5 — --all-comments for all)");
	expect(some).not.toContain("c2");
	const all = formatPageView(fullPage({ comments }), VIEW_NOW, true);
	expect(all).toContain("Comments (7)");
	expect(all).toContain("c1");
});

test("view: lists attachment filenames", () => {
	const lines = formatPageView(
		fullPage({ attachments: [{ mediaId: "m1", filename: "diagram.png", url: "https://x/1" }] }),
		VIEW_NOW,
		false,
	);
	expect(lines).toContain("Attachments");
	expect(lines).toContain("- diagram.png");
});
