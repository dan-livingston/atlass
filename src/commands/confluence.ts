import { input } from "@inquirer/prompts";
import { writeFile } from "node:fs/promises";

import type { CopyOptions } from "./jira.ts";

import { adfToMarkdown } from "../adf/to-markdown.ts";
import { downloadAttachments } from "../api/attachments.ts";
import { AtlassianClient } from "../api/client.ts";
import { fetchPage } from "../api/confluence.ts";
import { requireAuth } from "../credentials.ts";
import {
	attachmentsSection,
	commentsSection,
	frontmatter,
	joinSections,
	mediaResolver,
} from "../markdown/document.ts";
import { resolveOutput, slugify } from "../util/output-path.ts";
import { parsePageId } from "../util/parse.ts";

export async function confluenceCopy(arg: string | undefined, options: CopyOptions): Promise<void> {
	const auth = await requireAuth();
	const id = await resolveId(arg);

	const client = new AtlassianClient(auth);
	console.log(`Fetching page ${id} ...`);
	const page = await fetchPage(client, auth.site, id);

	const target = resolveOutput(`${page.id}-${slugify(page.title)}`, options.out);
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
