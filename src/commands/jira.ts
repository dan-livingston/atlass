import { input } from "@inquirer/prompts";
import { writeFile } from "node:fs/promises";

import { adfToMarkdown } from "../adf/to-markdown.ts";
import { downloadAttachments } from "../api/attachments.ts";
import { AtlassianClient } from "../api/client.ts";
import { fetchIssue } from "../api/jira.ts";
import { requireAuth } from "../credentials.ts";
import {
	attachmentsSection,
	commentsSection,
	frontmatter,
	joinSections,
	mediaResolver,
} from "../markdown/document.ts";
import { resolveOutput } from "../util/output-path.ts";
import { parseIssueKey } from "../util/parse.ts";

export interface CopyOptions {
	out?: string;
}

export async function jiraCopy(arg: string | undefined, options: CopyOptions): Promise<void> {
	const auth = await requireAuth();
	const key = await resolveKey(arg);

	const client = new AtlassianClient(auth);
	console.log(`Fetching ${key} ...`);
	const issue = await fetchIssue(client, auth.site, key);

	const target = resolveOutput(issue.key, options.out);
	const downloaded = await downloadAttachments(
		client,
		issue.attachments,
		target.assetsDir,
		target.assetsDirName,
	);
	const resolveMedia = mediaResolver(downloaded);

	const meta = frontmatter({
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
	});

	const document = joinSections([
		meta,
		`# ${issue.summary}`,
		adfToMarkdown(issue.description, { resolveMedia }),
		commentsSection(issue.comments, resolveMedia),
		attachmentsSection(downloaded),
	]);

	await writeFile(target.filePath, document, "utf8");
	report(target.filePath, downloaded.length);
}

async function resolveKey(arg: string | undefined): Promise<string> {
	const raw = arg ?? (await input({ message: "Jira issue key or URL:", required: true }));
	const key = parseIssueKey(raw);
	if (!key) throw new Error(`Could not find an issue key in "${raw}" (expected e.g. PROJ-123).`);
	return key;
}

function report(filePath: string, assetCount: number): void {
	const suffix =
		assetCount > 0 ? ` (+${assetCount} attachment${assetCount === 1 ? "" : "s"})` : "";
	console.log(`Wrote ${filePath}${suffix}`);
}
