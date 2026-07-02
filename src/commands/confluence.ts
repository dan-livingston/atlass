import { input } from "@inquirer/prompts";
import { writeFile } from "node:fs/promises";

import type { CopyOptions } from "./jira.ts";

import { adfToMarkdown } from "../adf/to-markdown.ts";
import { downloadAttachments } from "../api/attachments.ts";
import { AtlassianClient } from "../api/client.ts";
import { fetchPage, searchPages } from "../api/confluence.ts";
import { requireAuth } from "../credentials.ts";
import {
	attachmentsSection,
	commentsSection,
	frontmatter,
	joinSections,
	mediaResolver,
} from "../markdown/document.ts";
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
