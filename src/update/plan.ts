import type { AdfDoc } from "#/adf/types.ts";
import type { JiraIssue } from "#/api/jira-types.ts";
import type { IssueSource } from "#/markdown/copied-document.ts";

import { externalMedia, imageHrefs, markdownToAdf } from "#/adf/from-markdown.ts";
import { findLossyNodes, formatLossy, JIRA_LOSSY_LABELS } from "#/adf/lossy.ts";
import { isExternalHref } from "#/util/parse.ts";

export interface Revision {
	local: string;
	server: string;
	stale: boolean;
}

export interface Headline {
	label: string;
	current: string;
	next: string;
}

export type ImageKind = "external" | "reuse" | "upload" | "changed" | "missing" | "unsupported";

export interface PlannedImage {
	href: string;
	kind: ImageKind;
}

export interface PendingUpload {
	href: string;
	path: string;
	filename: string;
}

export type Verdict =
	| { kind: "proceed" }
	| { kind: "confirm"; message: string }
	| { kind: "refuse"; message: string };

export interface UpdatePlan {
	noun: string;
	id: string;
	headline: Headline;
	revision: Revision;
	lossy: Map<string, number>;
	images: PlannedImage[];
	uploads: PendingUpload[];
	body: AdfDoc;
	refusals: string[];
	verdict: Verdict;
}

export interface IssuePlanOptions {
	summary?: boolean;
	force?: boolean;
}

export function planIssueUpdate(
	source: IssueSource,
	issue: JiraIssue,
	options: IssuePlanOptions,
): UpdatePlan {
	const images: PlannedImage[] = imageHrefs(source.body).map((href) => ({
		href,
		kind: isExternalHref(href) ? "external" : "unsupported",
	}));
	const unsupported = images.filter((i) => i.kind === "unsupported").map((i) => i.href);
	const body = markdownToAdf(source.body, {
		resolveImage: (href, alt) => (isExternalHref(href) ? externalMedia(href, alt) : undefined),
	});
	const refusals = [
		...(unsupported.length > 0
			? [
					`jira update does not support image changes yet. ` +
						`Remove local image reference(s) or edit text only: ${unsupported.join(", ")}`,
				]
			: []),
		...emptyBodyRefusal(body),
	];
	return withVerdict(
		{
			noun: "issue",
			id: source.key,
			headline: headline("summary", issue.summary, source.title, options.summary),
			revision: revision(source.updatedAtCopy, issue.updated),
			lossy: findLossyNodes(issue.description, JIRA_LOSSY_LABELS),
			images,
			uploads: [],
			body,
			refusals,
		},
		options.force ?? false,
	);
}

export function formatPlan(plan: UpdatePlan): string[] {
	const lines = [`Dry run for ${plan.noun} ${plan.id} "${plan.headline.current}"`];
	if (plan.headline.next !== plan.headline.current) {
		lines.push(
			row(plan.headline.label, `"${plan.headline.current}" -> "${plan.headline.next}"`),
		);
	}
	const counts = imageCounts(plan.images);
	if (counts) lines.push(row("images", counts));
	for (const refusal of plan.refusals) lines.push(row("blocked", refusal));
	if (plan.lossy.size > 0)
		lines.push(row("warning", `${formatLossy(plan.lossy)} will be removed`));
	if (plan.revision.stale) {
		lines.push(row("stale", `${revisionText(plan.revision)} (would refuse without --force)`));
	}
	lines.push("  nothing was written (dry run)");
	return lines;
}

const IMAGE_COUNT_LABELS: [ImageKind, string][] = [
	["upload", "new"],
	["changed", "changed"],
	["reuse", "reused"],
	["external", "external"],
	["unsupported", "unsupported"],
	["missing", "missing"],
];

function imageCounts(images: PlannedImage[]): string {
	return IMAGE_COUNT_LABELS.map(([kind, label]) => ({
		n: images.filter((i) => i.kind === kind).length,
		label,
	}))
		.filter(({ n }) => n > 0)
		.map(({ n, label }) => `${n} ${label}`)
		.join(", ");
}

function row(label: string, value: string): string {
	return `  ${`${label}:`.padEnd(9)}${value}`;
}

export function headline(
	label: string,
	current: string,
	title: string,
	useTitle?: boolean,
): Headline {
	return { label, current, next: useTitle && title ? title : current };
}

export function revision(local: string, server: string): Revision {
	return { local: local || "unknown", server: server || "unknown", stale: local !== server };
}

function revisionText(revision: Revision): string {
	return `copied at ${revision.local}, server now ${revision.server}`;
}

export function emptyBodyRefusal(body: AdfDoc): string[] {
	if (body.content && body.content.length > 0) return [];
	return ["Refusing to update: the converted body is empty."];
}

export function withVerdict(plan: Omit<UpdatePlan, "verdict">, force: boolean): UpdatePlan {
	return { ...plan, verdict: verdict(plan, force) };
}

function verdict(plan: Omit<UpdatePlan, "verdict">, force: boolean): Verdict {
	if (plan.refusals.length > 0) return { kind: "refuse", message: plan.refusals.join("\n") };
	const noun = plan.noun;
	if (plan.revision.stale && !force) {
		return {
			kind: "refuse",
			message:
				`${capitalize(noun)} changed on the server since you copied it ` +
				`(${revisionText(plan.revision)}). Re-copy the ${noun} or pass --force.`,
		};
	}
	if (plan.lossy.size > 0 && !force) {
		return {
			kind: "confirm",
			message:
				`This ${noun} contains ${formatLossy(plan.lossy)} that Markdown cannot represent ` +
				`and will be removed. Continue?`,
		};
	}
	return { kind: "proceed" };
}

function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}
