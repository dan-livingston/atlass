import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import type { AdfNode } from "#/adf/types.ts";
import type { DownloadedAttachment, RemoteAttachment } from "#/api/attachments.ts";
import type { ConfluencePage } from "#/api/confluence.ts";
import type { JiraIssue } from "#/api/jira-types.ts";
import type { FrontmatterValue } from "#/markdown/copied-document.ts";

import { adfToMarkdown } from "#/adf/to-markdown.ts";
import { mediaResolver } from "#/api/attachments.ts";
import { render } from "#/markdown/copied-document.ts";

export interface CopiedCommentSource {
	author: string;
	created: string;
	body: AdfNode | null;
}

export interface PlannedDownload extends DownloadedAttachment {
	path: string;
}

interface CopiedContent {
	fields: Record<string, FrontmatterValue>;
	title: string;
	body: AdfNode | null;
	comments: CopiedCommentSource[];
}

export interface CopyPlan extends CopiedContent {
	filePath: string;
	assetsDir: string;
	downloads: PlannedDownload[];
}

interface CopySource extends CopiedContent {
	baseName: string;
	attachments: RemoteAttachment[];
}

export function planIssueCopy(issue: JiraIssue, out: string | undefined): CopyPlan {
	return planCopy(
		{
			baseName: issue.key,
			fields: {
				key: issue.key,
				type: issue.type,
				status: issue.status,
				assignee: issue.assignee,
				reporter: issue.reporter,
				priority: issue.priority,
				labels: issue.labels,
				created: issue.created,
				updated: issue.updated,
				url: issue.url,
			},
			title: issue.summary,
			body: issue.description,
			comments: issue.comments,
			attachments: issue.attachments,
		},
		out,
	);
}

export function planPageCopy(page: ConfluencePage, out: string | undefined): CopyPlan {
	return planCopy(
		{
			baseName: `${page.id}-${slugify(page.title)}`,
			fields: {
				title: page.title,
				id: page.id,
				space: page.spaceKey,
				version: page.version,
				author: page.author,
				created: page.createdAt,
				updated: page.updatedAt,
				url: page.url,
			},
			title: page.title,
			body: page.body,
			comments: page.comments,
			attachments: page.attachments,
		},
		out,
	);
}

export function renderCopy(plan: CopyPlan, landed: DownloadedAttachment[]): string {
	const resolveMedia = mediaResolver(landed);
	return render({
		fields: plan.fields,
		title: plan.title,
		body: adfToMarkdown(plan.body, { resolveMedia }),
		comments: plan.comments.map((c) => ({
			author: c.author,
			created: c.created,
			body: adfToMarkdown(c.body, { resolveMedia }),
		})),
		attachments: landed,
	});
}

function planCopy(source: CopySource, out: string | undefined): CopyPlan {
	const { baseName, attachments, ...content } = source;
	const target = outputTarget(baseName, out);
	return {
		...content,
		filePath: target.filePath,
		assetsDir: target.assetsDir,
		downloads: planDownloads(attachments, target),
	};
}

interface OutputTarget {
	filePath: string;
	assetsDir: string;
	assetsDirName: string;
}

function outputTarget(base: string, out: string | undefined): OutputTarget {
	let filePath: string;
	if (!out) {
		filePath = resolve(`${base}.md`);
	} else if (out.endsWith(".md")) {
		filePath = isAbsolute(out) ? out : resolve(out);
	} else {
		filePath = resolve(out, `${base}.md`);
	}
	const dir = dirname(filePath);
	const stem = filePath.slice(dir.length + 1).replace(/\.md$/, "");
	const assetsDirName = `${stem}.assets`;
	return { filePath, assetsDir: join(dir, assetsDirName), assetsDirName };
}

function slugify(title: string): string {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60)
		.replace(/-+$/g, "");
	return slug || "page";
}

function planDownloads(attachments: RemoteAttachment[], target: OutputTarget): PlannedDownload[] {
	const used = new Set<string>();
	return attachments.map((att) => {
		const savedAs = uniqueName(bareFilename(att.filename), used);
		return {
			...att,
			relativePath: `${target.assetsDirName}/${savedAs}`,
			path: join(target.assetsDir, savedAs),
		};
	});
}

function bareFilename(name: string): string {
	return basename(name).replace(/[/\\]/g, "_") || "attachment";
}

function uniqueName(name: string, used: Set<string>): string {
	let candidate = name;
	for (let suffix = 1; used.has(candidate); suffix++) candidate = numberedName(name, suffix);
	used.add(candidate);
	return candidate;
}

function numberedName(name: string, suffix: number): string {
	const dot = name.lastIndexOf(".");
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot) : "";
	return `${stem}-${suffix}${ext}`;
}
