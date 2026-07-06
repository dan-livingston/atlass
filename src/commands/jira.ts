import type { Tokens } from "marked";

import { confirm, input } from "@inquirer/prompts";
import { marked } from "marked";
import { readFile, writeFile } from "node:fs/promises";

import { markdownToAdf } from "../adf/from-markdown.ts";
import { adfToMarkdown } from "../adf/to-markdown.ts";
import { downloadAttachments } from "../api/attachments.ts";
import { AtlassianClient } from "../api/client.ts";
import { fetchIssue, searchIssues, updateIssue } from "../api/jira.ts";
import { requireAuth } from "../credentials.ts";
import {
	attachmentsSection,
	commentsSection,
	frontmatter,
	joinSections,
	mediaResolver,
} from "../markdown/document.ts";
import {
	findLossyNodes,
	formatLossy,
	JIRA_LOSSY_LABELS,
	parseJiraUpdateSource,
} from "../markdown/update-source.ts";
import { resolveOutput } from "../util/output-path.ts";
import { parseIssueKey, parseLimit } from "../util/parse.ts";
import { runSearch } from "./search-run.ts";

export interface CopyOptions {
	out?: string;
}

export interface SearchOptions {
	project?: string;
	assignee?: string;
	status?: string;
	jql?: string;
	limit?: string;
	json?: boolean;
	copy?: boolean;
	out?: string;
}

export async function jiraCopy(arg: string | undefined, options: CopyOptions): Promise<void> {
	const auth = await requireAuth();
	const key = await resolveKey(arg);
	const client = new AtlassianClient(auth);
	await copyIssue(client, auth.site, key, options.out);
}

export interface UpdateOptions {
	summary?: boolean;
	force?: boolean;
	dryRun?: boolean;
}

export async function jiraUpdate(arg: string | undefined, options: UpdateOptions): Promise<void> {
	const file =
		arg ?? (await input({ message: "Path to the issue Markdown file:", required: true }));
	const src = parseJiraUpdateSource(await readFile(file, "utf8"));

	const auth = await requireAuth();
	const client = new AtlassianClient(auth);

	const issue = await fetchIssue(client, auth.site, src.key);
	const stale = issue.updated !== src.updated;
	const { local, external } = classifyImages(src.body);
	const lossy = findLossyNodes(issue.description, JIRA_LOSSY_LABELS);
	const newSummary = options.summary && src.bodyTitle ? src.bodyTitle : issue.summary;

	if (options.dryRun) {
		printDryRun(src.key, issue.summary, newSummary, stale, external.length, local, lossy);
		return;
	}

	// image changes are not supported yet; external URLs pass through as external
	// media, but a local image cannot be uploaded, so refuse rather than drop it.
	if (local.length > 0) {
		throw new Error(
			`jira update does not support image changes yet. ` +
				`Remove local image reference(s) or edit text only: ${local.join(", ")}`,
		);
	}

	if (stale && !options.force) {
		throw new Error(
			`Issue changed on the server since you copied it ` +
				`(local ${src.updated || "unknown"}, server ${issue.updated}). ` +
				`Re-copy the issue or pass --force.`,
		);
	}

	if (lossy.size > 0 && !options.force) {
		const ok = await confirm({
			message:
				`This issue's description contains ${formatLossy(lossy)} that Markdown ` +
				`cannot represent and will be removed. Continue?`,
			default: false,
		});
		if (!ok) {
			console.log("Aborted.");
			return;
		}
	}

	const description = markdownToAdf(src.body);
	if (!description.content || description.content.length === 0) {
		throw new Error("Refusing to update: the converted description is empty.");
	}

	await updateIssue(client, src.key, {
		description,
		summary: options.summary && newSummary !== issue.summary ? newSummary : undefined,
	});
	console.log(`Updated ${src.key}.`);
}

export async function jiraSearch(query: string | undefined, options: SearchOptions): Promise<void> {
	if (options.jql && (query || options.project || options.assignee || options.status)) {
		throw new Error("--jql cannot be combined with a text query or other filters.");
	}
	if (options.json && options.copy) {
		throw new Error("--json and --copy cannot be used together.");
	}

	const auth = await requireAuth();
	const client = new AtlassianClient(auth);
	const limit = parseLimit(options.limit);
	const issues = await searchIssues(client, auth.site, {
		text: query,
		project: options.project,
		assignee: options.assignee,
		status: options.status,
		jql: options.jql,
		limit,
	});

	await runSearch(
		issues.map((i) => ({
			id: i.key,
			prefix: `${i.key}  ${i.status}`,
			text: i.summary,
			json: { key: i.key, status: i.status, summary: i.summary, url: i.url },
		})),
		{
			json: options.json,
			copy: options.copy,
			limit,
			hasMore: issues.length === limit,
			out: options.out,
		},
		{ singular: "issue", plural: "issues" },
		(key) => copyIssue(client, auth.site, key, options.out),
	);
}

// Fetch one issue and write it to Markdown. Shared by the copy command and the
// search picker.
async function copyIssue(
	client: AtlassianClient,
	site: string,
	key: string,
	out: string | undefined,
): Promise<void> {
	console.log(`Fetching ${key} ...`);
	const issue = await fetchIssue(client, site, key);

	const target = resolveOutput(issue.key, out);
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

// ---- update helpers ----

// Split the distinct image hrefs in the body into external URLs (pass through as
// external media) and local paths (unsupported, refused before an update).
function classifyImages(md: string): { local: string[]; external: string[] } {
	const local: string[] = [];
	const external: string[] = [];
	const seen = new Set<string>();
	void marked.walkTokens(marked.lexer(md), (token) => {
		if (token.type !== "image") return;
		const href = (token as Tokens.Image).href;
		if (seen.has(href)) return;
		seen.add(href);
		if (/^[a-z][a-z0-9+.-]*:\/\//i.test(href)) external.push(href);
		else local.push(href);
	});
	return { local, external };
}

function printDryRun(
	key: string,
	currentSummary: string,
	newSummary: string,
	stale: boolean,
	externalImages: number,
	localImages: string[],
	lossy: Map<string, number>,
): void {
	console.log(`Dry run for ${key} "${currentSummary}"`);
	if (newSummary !== currentSummary) {
		console.log(`  summary: "${currentSummary}" -> "${newSummary}"`);
	}
	if (externalImages > 0) console.log(`  images:  ${externalImages} external`);
	if (localImages.length > 0) {
		console.log(
			`  blocked: ${localImages.length} local image(s) not supported (edit text only)`,
		);
	}
	if (lossy.size > 0) console.log(`  warning: ${formatLossy(lossy)} will be removed`);
	if (stale) console.log(`  stale:   server changed since copy (would refuse without --force)`);
	console.log("  nothing was written (dry run)");
}
