import type { AdfDoc } from "#/adf/types.ts";
import type { CopiedSource } from "#/markdown/copied-document.ts";
import type { LocalImage } from "#/update/plan-page.ts";
import type { PlannedImage } from "#/update/plan.ts";

import { externalMedia, imageHrefs, markdownToAdf } from "#/adf/from-markdown.ts";
import { htmlWarnings } from "#/adf/html.ts";
import { imageCounts, row } from "#/update/plan.ts";
import { isExternalHref } from "#/util/parse.ts";

export interface CreateTarget {
	space: string;
	spaceId: string | null;
	parentId?: string;
}

export interface CreatePlan extends CreateTarget {
	title: string;
	images: PlannedImage[];
	body: AdfDoc;
	warnings: string[];
	refusals: string[];
}

export function planPageCreate(
	draft: CopiedSource,
	target: CreateTarget,
	localImages: LocalImage[],
): CreatePlan {
	const images: PlannedImage[] = imageHrefs(draft.body).map((href) => ({
		href,
		kind: imageKind(href, localImages),
	}));
	const missing = images.filter((i) => i.kind === "missing").map((i) => i.href);
	return {
		...target,
		title: draft.title,
		images,
		body: markdownToAdf(draft.body, {
			resolveImage: (href, alt) =>
				isExternalHref(href) ? externalMedia(href, alt) : undefined,
		}),
		warnings: htmlWarnings(draft.body),
		refusals: [
			...(draft.title ? [] : ["No title. Add an H1 or a `title` to the frontmatter."]),
			...spaceRefusal(target),
			...(missing.length > 0 ? [`Image file(s) not found: ${missing.join(", ")}`] : []),
		],
	};
}

export function formatCreatePlan(plan: CreatePlan): string[] {
	const lines = [`Dry run for new page "${plan.title}"`];
	if (plan.spaceId) lines.push(row("space", plan.space));
	lines.push(row("parent", plan.parentId ?? "space homepage"));
	const counts = imageCounts(plan.images);
	if (counts) lines.push(row("images", counts));
	for (const refusal of plan.refusals) lines.push(row("blocked", refusal));
	for (const warning of plan.warnings) lines.push(row("warning", warning));
	lines.push("  nothing was written (dry run)");
	return lines;
}

function imageKind(href: string, localImages: LocalImage[]): PlannedImage["kind"] {
	if (isExternalHref(href)) return "external";
	const local = localImages.find((l) => l.href === href);
	return local?.size === undefined ? "missing" : "upload";
}

function spaceRefusal({ space, spaceId }: CreateTarget): string[] {
	if (!space) return ["No space. Pass --space or add `space` to the frontmatter."];
	return spaceId ? [] : [`Space "${space}" not found.`];
}
