import type { Tokens } from "marked";

import { confirm, input } from "@inquirer/prompts";
import { marked } from "marked";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";

import type { AdfNode } from "../adf/types.ts";
import type { AttachmentInfo } from "../api/confluence.ts";
import type { CopyOptions } from "./jira.ts";

import { markdownToAdf } from "../adf/from-markdown.ts";
import { adfToMarkdown } from "../adf/to-markdown.ts";
import { downloadAttachments } from "../api/attachments.ts";
import { AtlassianClient } from "../api/client.ts";
import {
	fetchPage,
	fetchPageState,
	listAttachments,
	searchPages,
	updatePage,
	uploadAttachment,
} from "../api/confluence.ts";
import { requireAuth } from "../credentials.ts";
import {
	attachmentsSection,
	commentsSection,
	frontmatter,
	joinSections,
	mediaResolver,
} from "../markdown/document.ts";
import { findLossyNodes, formatLossy, parseUpdateSource } from "../markdown/update-source.ts";
import { resolveOutput, slugify } from "../util/output-path.ts";
import { parseLimit, parsePageId } from "../util/parse.ts";
import { runSearch } from "./search-run.ts";

export interface SearchOptions {
	space?: string;
	cql?: string;
	limit?: string;
	json?: boolean;
	copy?: boolean;
	out?: string;
}

export async function confluenceCopy(arg: string | undefined, options: CopyOptions): Promise<void> {
	const auth = await requireAuth();
	const id = await resolveId(arg);
	const client = new AtlassianClient(auth);
	await copyPage(client, auth.site, id, options.out);
}

export interface UpdateOptions {
	title?: boolean;
	message?: string;
	force?: boolean;
	dryRun?: boolean;
}

export async function confluenceUpdate(
	arg: string | undefined,
	options: UpdateOptions,
): Promise<void> {
	const file =
		arg ?? (await input({ message: "Path to the page Markdown file:", required: true }));
	const src = parseUpdateSource(await readFile(file, "utf8"));

	const auth = await requireAuth();
	const client = new AtlassianClient(auth);

	const state = await fetchPageState(client, src.id);
	if (state.version !== src.version && !options.force) {
		throw new Error(
			`Page changed on the server since you copied it ` +
				`(local v${src.version}, server v${state.version}). Re-copy the page or pass --force.`,
		);
	}

	const dir = dirname(resolve(file));
	const attachments = await listAttachments(client, src.id);
	const plan = await planImages(dir, collectImageHrefs(src.body), attachments);

	const lossy = findLossyNodes(state.body);
	const nextVersion = state.version + 1;
	const newTitle = options.title && src.bodyTitle ? src.bodyTitle : state.title;

	if (options.dryRun) {
		printDryRun(src.id, state.title, newTitle, state.version, nextVersion, lossy, plan);
		return;
	}

	if (lossy.size > 0 && !options.force) {
		const ok = await confirm({
			message:
				`This page contains ${formatLossy(lossy)} that Markdown cannot represent ` +
				`and will be removed. Continue?`,
			default: false,
		});
		if (!ok) {
			console.log("Aborted.");
			return;
		}
	}

	const collection = `contentId-${src.id}`;
	const fileIds = new Map<string, string>();
	for (const [href, entry] of plan) {
		if (entry.kind === "upload") {
			console.log(`Uploading ${entry.filename} ...`);
			fileIds.set(
				href,
				await uploadAttachment(client, src.id, entry.filename, await readFile(entry.path)),
			);
		} else if (entry.kind === "reuse") {
			fileIds.set(href, entry.fileId);
		}
	}

	const body = markdownToAdf(src.body, {
		resolveImage: (href, alt) => {
			const entry = plan.get(href);
			if (!entry) return undefined;
			if (entry.kind === "external") return externalMedia(href, alt);
			const fileId = fileIds.get(href);
			return fileId ? fileMedia(fileId, collection, alt) : undefined;
		},
	});
	if (!body.content || body.content.length === 0) {
		throw new Error("Refusing to update: the converted body is empty.");
	}

	const version = await updatePage(client, src.id, {
		title: newTitle,
		version: nextVersion,
		body,
		message: options.message ?? "Updated via atlass",
	});
	console.log(`Updated page ${src.id} to version ${version}.`);
}

export async function confluenceSearch(
	query: string | undefined,
	options: SearchOptions,
): Promise<void> {
	if (options.cql && (query || options.space)) {
		throw new Error("--cql cannot be combined with a text query or --space.");
	}
	if (options.json && options.copy) {
		throw new Error("--json and --copy cannot be used together.");
	}

	const auth = await requireAuth();
	const client = new AtlassianClient(auth);
	const limit = parseLimit(options.limit);
	const { pages, hasMore } = await searchPages(client, auth.site, {
		text: query,
		space: options.space,
		cql: options.cql,
		limit,
	});

	await runSearch(
		pages.map((p) => ({
			id: p.id,
			prefix: `${p.id}  ${p.space}`,
			text: p.title,
			json: { id: p.id, space: p.space, title: p.title, url: p.url },
		})),
		{ json: options.json, copy: options.copy, limit, hasMore, out: options.out },
		{ singular: "page", plural: "pages" },
		(id) => copyPage(client, auth.site, id, options.out),
	);
}

// Fetch one page and write it to Markdown. Shared by the copy command and the
// search picker.
async function copyPage(
	client: AtlassianClient,
	site: string,
	id: string,
	out: string | undefined,
): Promise<void> {
	console.log(`Fetching page ${id} ...`);
	const page = await fetchPage(client, site, id);

	const target = resolveOutput(`${page.id}-${slugify(page.title)}`, out);
	const downloaded = await downloadAttachments(
		client,
		page.attachments,
		target.assetsDir,
		target.assetsDirName,
	);
	const resolveMedia = mediaResolver(downloaded);

	const meta = frontmatter({
		title: page.title,
		id: page.id,
		space: page.spaceKey,
		version: page.version,
		author: page.author,
		created: page.createdAt,
		updated: page.updatedAt,
		url: page.url,
	});

	const document = joinSections([
		meta,
		`# ${page.title}`,
		adfToMarkdown(page.body, { resolveMedia }),
		commentsSection(page.comments, resolveMedia),
		attachmentsSection(downloaded),
	]);

	await writeFile(target.filePath, document, "utf8");
	const suffix =
		downloaded.length > 0
			? ` (+${downloaded.length} attachment${downloaded.length === 1 ? "" : "s"})`
			: "";
	console.log(`Wrote ${target.filePath}${suffix}`);
}

async function resolveId(arg: string | undefined): Promise<string> {
	const raw = arg ?? (await input({ message: "Confluence page id or URL:", required: true }));
	const id = parsePageId(raw);
	if (!id) throw new Error(`Could not find a page id in "${raw}".`);
	return id;
}

// ---- update helpers ----

type ImagePlan =
	| { kind: "external" }
	| { kind: "reuse"; fileId: string; filename: string }
	| { kind: "upload"; path: string; filename: string; existed: boolean };

// Collect the distinct image hrefs referenced in the body Markdown.
function collectImageHrefs(md: string): string[] {
	const hrefs = new Set<string>();
	void marked.walkTokens(marked.lexer(md), (token) => {
		if (token.type === "image") hrefs.add((token as Tokens.Image).href);
	});
	return [...hrefs];
}

// Decide what to do with each image before any upload: external URLs pass
// through, local files are reused when an attachment of the same name and size
// already exists, otherwise uploaded. Missing local files abort the update.
async function planImages(
	dir: string,
	hrefs: string[],
	attachments: AttachmentInfo[],
): Promise<Map<string, ImagePlan>> {
	const byName = new Map(attachments.map((a) => [a.filename, a]));
	const plan = new Map<string, ImagePlan>();
	const missing: string[] = [];
	for (const href of hrefs) {
		if (isExternal(href)) {
			plan.set(href, { kind: "external" });
			continue;
		}
		const path = isAbsolute(href) ? href : resolve(dir, href);
		let size: number;
		try {
			size = (await stat(path)).size;
		} catch {
			missing.push(href);
			continue;
		}
		const filename = basename(path);
		const existing = byName.get(filename);
		if (existing && existing.size === size) {
			plan.set(href, { kind: "reuse", fileId: existing.fileId, filename });
		} else {
			plan.set(href, { kind: "upload", path, filename, existed: existing !== undefined });
		}
	}
	if (missing.length > 0) {
		throw new Error(`Image file(s) not found: ${missing.join(", ")}`);
	}
	return plan;
}

function isExternal(href: string): boolean {
	return /^[a-z][a-z0-9+.-]*:\/\//i.test(href);
}

function externalMedia(href: string, alt: string): AdfNode {
	const attrs: Record<string, unknown> = { type: "external", url: href };
	if (alt) attrs["alt"] = alt;
	return {
		type: "mediaSingle",
		attrs: { layout: "center" },
		content: [{ type: "media", attrs }],
	};
}

function fileMedia(fileId: string, collection: string, alt: string): AdfNode {
	const attrs: Record<string, unknown> = { type: "file", id: fileId, collection };
	if (alt) attrs["alt"] = alt;
	return {
		type: "mediaSingle",
		attrs: { layout: "center" },
		content: [{ type: "media", attrs }],
	};
}

function printDryRun(
	id: string,
	currentTitle: string,
	newTitle: string,
	currentVersion: number,
	nextVersion: number,
	lossy: Map<string, number>,
	plan: Map<string, ImagePlan>,
): void {
	const entries = [...plan.values()];
	const added = entries.filter((e) => e.kind === "upload" && !e.existed).length;
	const changed = entries.filter((e) => e.kind === "upload" && e.existed).length;
	const reused = entries.filter((e) => e.kind === "reuse").length;
	const external = entries.filter((e) => e.kind === "external").length;

	console.log(`Dry run for page ${id} "${currentTitle}"`);
	console.log(`  version: ${currentVersion} -> ${nextVersion}`);
	if (newTitle !== currentTitle) console.log(`  title:   "${currentTitle}" -> "${newTitle}"`);
	console.log(
		`  images:  ${added} new, ${changed} changed, ${reused} reused, ${external} external`,
	);
	if (lossy.size > 0) console.log(`  warning: ${formatLossy(lossy)} will be removed`);
	console.log("  nothing was written (dry run)");
}
