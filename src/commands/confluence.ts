import { input } from "@inquirer/prompts";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";

import type { LocalImage } from "../update/plan.ts";
import type { CopyOptions } from "./jira.ts";

import { imageHrefs } from "../adf/from-markdown.ts";
import { adfToMarkdown } from "../adf/to-markdown.ts";
import { downloadAttachments, mediaResolver } from "../api/attachments.ts";
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
import { parsePageSource, render } from "../markdown/copied-document.ts";
import { planPageUpdate, withUploadedIds } from "../update/plan.ts";
import { runPlan } from "../update/run.ts";
import { resolveOutput, slugify } from "../util/output-path.ts";
import { isExternalHref, parseLimit, parsePageId } from "../util/parse.ts";
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
	const src = parsePageSource(await readFile(file, "utf8"));

	const auth = await requireAuth();
	const client = new AtlassianClient(auth);
	const state = await fetchPageState(client, src.id);
	const attachments = await listAttachments(client, src.id);
	const localImages = await statLocalImages(dirname(resolve(file)), src.body);

	const plan = planPageUpdate(src, state, attachments, localImages, options);
	await runPlan(plan, options, async () => {
		const ids = new Map<string, string>();
		for (const upload of plan.uploads) {
			console.log(`Uploading ${upload.filename} ...`);
			const bytes = await readFile(upload.path);
			ids.set(upload.href, await uploadAttachment(client, src.id, upload.filename, bytes));
		}
		const version = await updatePage(client, src.id, {
			title: plan.headline.next,
			nextVersion: state.version + 1,
			body: withUploadedIds(plan.body, ids),
			message: options.message ?? "Updated via atlass",
		});
		console.log(`Updated page ${src.id} to version ${version}.`);
	});
}

async function statLocalImages(dir: string, md: string): Promise<LocalImage[]> {
	const hrefs = imageHrefs(md).filter((href) => !isExternalHref(href));
	return Promise.all(
		hrefs.map(async (href) => {
			const path = isAbsolute(href) ? href : resolve(dir, href);
			return { href, path, filename: basename(path), ...(await fileSize(path)) };
		}),
	);
}

async function fileSize(path: string): Promise<{ size?: number }> {
	try {
		return { size: (await stat(path)).size };
	} catch {
		return {};
	}
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
			fixedColumns: `${p.id}  ${p.space}`,
			freeText: p.title,
			json: { id: p.id, space: p.space, title: p.title, url: p.url },
		})),
		{ json: options.json, copy: options.copy, limit, hasMore, out: options.out },
		{ singular: "page", plural: "pages" },
		(id) => copyPage(client, auth.site, id, options.out),
	);
}

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

	const document = render({
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
		body: adfToMarkdown(page.body, { resolveMedia }),
		comments: page.comments.map((c) => ({
			author: c.author,
			created: c.created,
			body: adfToMarkdown(c.body, { resolveMedia }),
		})),
		attachments: downloaded,
	});

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
