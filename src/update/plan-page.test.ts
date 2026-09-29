import { expect, test } from "vite-plus/test";

import type { AdfNode } from "#/adf/types.ts";
import type { AttachmentInfo } from "#/api/confluence-attachments.ts";
import type { PageState } from "#/api/confluence-pages.ts";
import type { PageSource } from "#/markdown/copied-document.ts";
import type { LocalImage, PagePlanOptions } from "#/update/plan-page.ts";

import { planPageUpdate, withUploadedIds } from "#/update/plan-page.ts";
import { formatPlan } from "#/update/plan.ts";

function paragraph(text: string): AdfNode {
	return { type: "paragraph", content: [{ type: "text", text }] };
}

function doc(...content: AdfNode[]): AdfNode {
	return { type: "doc", content };
}

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

function options(over: Partial<PagePlanOptions> = {}): PagePlanOptions {
	return { file: "page.md", ...over };
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
	const plan = planPageUpdate(
		pageSource({ title: "Renamed" }),
		pageState(),
		[],
		[],
		options({ title: true }),
	);
	expect(plan.verdict).toEqual({ kind: "proceed" });
	expect(plan.noun).toBe("page");
	expect(plan.headline).toEqual({ label: "title", current: "My Page", next: "Renamed" });
	expect(plan.revision).toEqual({ local: "v7", server: "v7", stale: false });
	expect(plan.body).toEqual({ type: "doc", version: 1, content: [paragraph("New body.")] });
});

test("page: a newer server version refuses unless forced", () => {
	const plan = planPageUpdate(pageSource(), pageState({ version: 9 }), [], [], options());
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
	expect(planPageUpdate(pageSource(), state, [], [], options()).verdict).toEqual({
		kind: "confirm",
		message:
			"This page contains 1 layout that Markdown cannot represent and will be removed. " +
			"Continue?",
	});
	expect(planPageUpdate(pageSource(), state, [], [], options({ force: true })).verdict).toEqual({
		kind: "proceed",
	});
	expect(
		planPageUpdate(pageSource({ body: "" }), pageState(), [], [], options()).verdict,
	).toEqual({
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
	const plan = planPageUpdate(src, pageState(), attachments, locals, options());
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

test("page: videos fill the text column while images keep their natural size", () => {
	const src = pageSource({
		body: [
			"![demo](p.assets/demo.mp4)",
			"![clip](p.assets/Clip.MOV)",
			"![remote](https://cdn/intro.webm?v=2)",
			"![shot](p.assets/shot.png)",
		].join("\n\n"),
	});
	const attachments = [attachment("demo.mp4", "f-demo", 10)];
	const locals = [
		local("p.assets/demo.mp4", 10),
		local("p.assets/Clip.MOV", 20),
		local("p.assets/shot.png", 5),
	];
	const plan = planPageUpdate(src, pageState(), attachments, locals, options());
	expect(plan.body.content?.map((n) => n.attrs)).toEqual([
		{ layout: "center", width: 100, widthType: "percentage" },
		{ layout: "center", width: 100, widthType: "percentage" },
		{ layout: "center", width: 100, widthType: "percentage" },
		{ layout: "center" },
	]);
});

test("page: a missing image file is refused even with --force", () => {
	const src = pageSource({ body: "Text.\n\n![gone](p.assets/gone.png)" });
	const plan = planPageUpdate(
		src,
		pageState(),
		[],
		[local("p.assets/gone.png")],
		options({ force: true }),
	);
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
		options(),
	);
	expect(formatPlan(plan)).toEqual([
		'Dry run for page 123 "My Page"',
		"  images:  1 new, 1 reused, 1 external",
		"  stale:   copied at v7, server now v8 (would refuse without --force)",
		"--- server v8",
		"+++ page.md",
		"@@ -1,1 +1,1 @@",
		"-Old body.",
		"+![same](p.assets/same.png) ![fresh](p.assets/fresh.png) ![logo](https://cdn/logo.png)",
		"  nothing was written (dry run)",
	]);
});

test("page: the diff is empty when the body matches the server, reused images included", () => {
	const state = pageState({
		body: doc(
			paragraph("Intro."),
			media({ type: "file", id: "f-same", collection: "contentId-123", alt: "same" }),
		),
	});
	const src = pageSource({ body: "Intro.\n\n![same](img/same.png)" });
	const plan = planPageUpdate(
		src,
		state,
		[attachment("same.png", "f-same", 10)],
		[local("img/same.png", 10)],
		options(),
	);
	expect(plan.diff).toEqual([]);
});

test("page: author comments never reach the page, so they never show in the diff", () => {
	const state = pageState({ body: doc(paragraph("One."), paragraph("Two.")) });
	const src = pageSource({ body: "One.\n\n<!-- note to self -->\n\nTwo." });
	expect(planPageUpdate(src, state, [], [], options()).diff).toEqual([]);
});

test("page: the diff shows edited lines with context", () => {
	const state = pageState({
		body: doc(paragraph("One."), paragraph("Two."), paragraph("Three.")),
	});
	const plan = planPageUpdate(
		pageSource({ body: "One.\n\nTwo, edited.\n\nThree." }),
		state,
		[],
		[],
		options(),
	);
	expect(plan.diff).toEqual([
		"--- server v7",
		"+++ page.md",
		"@@ -1,5 +1,5 @@",
		" One.",
		" ",
		"-Two.",
		"+Two, edited.",
		" ",
		" Three.",
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
