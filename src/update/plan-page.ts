import type { AdfDoc, AdfNode } from "#/adf/types.ts";
import type { AttachmentInfo } from "#/api/confluence-attachments.ts";
import type { PageState } from "#/api/confluence-pages.ts";
import type { PageSource } from "#/markdown/copied-document.ts";
import type { PendingUpload, UpdatePlan } from "#/update/plan.ts";

import { externalMedia, imageHrefs, markdownToAdf, mediaNode } from "#/adf/from-markdown.ts";
import { htmlWarnings, withoutComments } from "#/adf/html.ts";
import { findLossyNodes } from "#/adf/lossy.ts";
import { adfToMarkdown } from "#/adf/to-markdown.ts";
import { unifiedDiff } from "#/update/body-diff.ts";
import {
	emptyBodyRefusal,
	headline,
	missingImagesRefusal,
	revision,
	withVerdict,
} from "#/update/plan.ts";
import { isExternalHref } from "#/util/parse.ts";

export interface LocalImage {
	href: string;
	path: string;
	filename: string;
	size?: number;
}

export interface PagePlanOptions {
	file: string;
	title?: boolean;
	force?: boolean;
}

export interface PageBody {
	images: PageImage[];
	body: AdfDoc;
	uploads: PendingUpload[];
}

export function planPageBody(
	page: { id: string; body: string },
	attachments: AttachmentInfo[],
	localImages: LocalImage[],
): PageBody {
	const collection = `contentId-${page.id}`;
	const images = imageHrefs(page.body).map((href) => pageImage(href, localImages, attachments));
	const byHref = new Map(images.map((e) => [e.href, e]));
	const body = markdownToAdf(page.body, {
		resolveImage: (href, alt) => {
			const entry = byHref.get(href);
			if (!entry || entry.kind === "missing") return undefined;
			if (entry.kind === "external") return externalMedia(href, alt);
			const id = entry.kind === "reuse" ? entry.fileId : href;
			return mediaNode({ type: "file", id, collection }, alt, href);
		},
	});
	const uploads = images.flatMap((e) =>
		e.kind === "upload" || e.kind === "changed"
			? [{ href: e.href, path: e.path, filename: e.filename }]
			: [],
	);
	return { images, body, uploads };
}

export function planPageUpdate(
	source: PageSource,
	state: PageState,
	attachments: AttachmentInfo[],
	localImages: LocalImage[],
	options: PagePlanOptions,
): UpdatePlan {
	const { images, body, uploads } = planPageBody(source, attachments, localImages);
	const missing = images.filter((e) => e.kind === "missing").map((e) => e.href);
	return withVerdict(
		{
			noun: "page",
			id: source.id,
			headline: headline("title", state.title, source.title, options.title),
			revision: revision(`v${source.version}`, `v${state.version}`),
			lossy: findLossyNodes(state.body),
			warnings: htmlWarnings(source.body),
			diff: unifiedDiff(
				serverMarkdown(state, attachments, images),
				withoutComments(source.body),
				[`server v${state.version}`, options.file],
			),
			images: images.map(({ href, kind }) => ({ href, kind })),
			uploads,
			body,
			refusals: [...missingImagesRefusal(missing), ...emptyBodyRefusal(body)],
		},
		options.force ?? false,
	);
}

function serverMarkdown(
	state: PageState,
	attachments: AttachmentInfo[],
	images: PageImage[],
): string {
	const reused = new Map(images.flatMap((e) => (e.kind === "reuse" ? [[e.fileId, e.href]] : [])));
	return adfToMarkdown(state.body, {
		resolveMedia: ({ id }) =>
			reused.get(id ?? "") ?? attachments.find((a) => a.fileId === id)?.filename,
	});
}

export type PageImage =
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
