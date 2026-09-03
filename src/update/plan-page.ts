import type { AdfDoc, AdfNode } from "#/adf/types.ts";
import type { AttachmentInfo } from "#/api/confluence-attachments.ts";
import type { PageState } from "#/api/confluence-pages.ts";
import type { PageSource } from "#/markdown/copied-document.ts";
import type { UpdatePlan } from "#/update/plan.ts";

import { externalMedia, imageHrefs, markdownToAdf, mediaNode } from "#/adf/from-markdown.ts";
import { findLossyNodes } from "#/adf/lossy.ts";
import { emptyBodyRefusal, headline, revision, withVerdict } from "#/update/plan.ts";
import { isExternalHref } from "#/util/parse.ts";

export interface LocalImage {
	href: string;
	path: string;
	filename: string;
	size?: number;
}

export interface PagePlanOptions {
	title?: boolean;
	force?: boolean;
}

export function planPageUpdate(
	source: PageSource,
	state: PageState,
	attachments: AttachmentInfo[],
	localImages: LocalImage[],
	options: PagePlanOptions,
): UpdatePlan {
	const collection = `contentId-${source.id}`;
	const entries = imageHrefs(source.body).map((href) =>
		pageImage(href, localImages, attachments),
	);
	const byHref = new Map(entries.map((e) => [e.href, e]));
	const body = markdownToAdf(source.body, {
		resolveImage: (href, alt) => {
			const entry = byHref.get(href);
			if (!entry || entry.kind === "missing") return undefined;
			if (entry.kind === "external") return externalMedia(href, alt);
			const id = entry.kind === "reuse" ? entry.fileId : href;
			return mediaNode({ type: "file", id, collection }, alt);
		},
	});
	const missing = entries.filter((e) => e.kind === "missing").map((e) => e.href);
	const refusals = [
		...(missing.length > 0 ? [`Image file(s) not found: ${missing.join(", ")}`] : []),
		...emptyBodyRefusal(body),
	];
	return withVerdict(
		{
			noun: "page",
			id: source.id,
			headline: headline("title", state.title, source.title, options.title),
			revision: revision(`v${source.version}`, `v${state.version}`),
			lossy: findLossyNodes(state.body),
			images: entries.map(({ href, kind }) => ({ href, kind })),
			uploads: entries.flatMap((e) =>
				e.kind === "upload" || e.kind === "changed"
					? [{ href: e.href, path: e.path, filename: e.filename }]
					: [],
			),
			body,
			refusals,
		},
		options.force ?? false,
	);
}

type PageImage =
	| { href: string; kind: "external" | "missing" }
	| { href: string; kind: "reuse"; fileId: string }
	| { href: string; kind: "upload" | "changed"; path: string; filename: string };

function pageImage(
	href: string,
	localImages: LocalImage[],
	attachments: AttachmentInfo[],
): PageImage {
	if (isExternalHref(href)) return { href, kind: "external" };
	const local = localImages.find((l) => l.href === href);
	if (!local || local.size === undefined) return { href, kind: "missing" };
	const existing = attachments.find((a) => a.filename === local.filename);
	if (existing && existing.size === local.size) {
		return { href, kind: "reuse", fileId: existing.fileId };
	}
	return {
		href,
		kind: existing ? "changed" : "upload",
		path: local.path,
		filename: local.filename,
	};
}

export function withUploadedIds(doc: AdfDoc, ids: Map<string, string>): AdfDoc {
	if (!doc.content) return doc;
	return { ...doc, content: doc.content.map((n) => withUploadedId(n, ids)) };
}

function withUploadedId(node: AdfNode, ids: Map<string, string>): AdfNode {
	const id = node.type === "media" ? node.attrs?.["id"] : undefined;
	const swapped =
		typeof id === "string" && ids.has(id)
			? { ...node, attrs: { ...node.attrs, id: ids.get(id) } }
			: node;
	if (!swapped.content) return swapped;
	return { ...swapped, content: swapped.content.map((n) => withUploadedId(n, ids)) };
}
