import kleur from "kleur";

import type {
	ChangedFile,
	PullRequestComment,
	PullRequestDetail,
	Reviewer,
} from "#/api/bitbucket-pr-detail.ts";
import type { CappedPage } from "#/api/bitbucket-repo.ts";
import type { BitbucketSession } from "#/api/session.ts";
import type { RenderedComment, ViewOptions } from "#/commands/view.ts";
import type { SessionEnv } from "#/env.ts";
import type { PullRequestRef, RepoRef } from "#/util/parse.ts";

import { getPullRequest, listChangedFiles, listComments } from "#/api/bitbucket-pr-detail.ts";
import { HttpError } from "#/api/http-error.ts";
import {
	colorForBitbucketState,
	PULL_REQUEST_SCOPE,
	withScopeHint,
} from "#/commands/bitbucket-shared.ts";
import { commentSection, dateWithAge, fieldLines, markdownBody } from "#/commands/view.ts";
import { parsePullRequestRef, resolveRepo } from "#/util/parse.ts";

export interface PrOptions extends ViewOptions {
	repo?: string;
	json?: boolean;
}

export async function bitbucketPr(
	{ session, term }: SessionEnv<BitbucketSession>,
	arg: string | undefined,
	options: PrOptions,
): Promise<void> {
	const ref = parseRef(arg);
	const repo = ref.repo ?? resolveRepo(options.repo, session);
	const detail = await withScopeHint(PULL_REQUEST_SCOPE, () =>
		fetchDetail(session, repo, ref.id),
	);
	const [comments, files] = await Promise.all([
		withScopeHint(PULL_REQUEST_SCOPE, () => listComments(session, repo, ref.id)),
		withScopeHint(PULL_REQUEST_SCOPE, () => listChangedFiles(session, repo, ref.id)),
	]);

	if (options.json) {
		term.json({
			...detail,
			comments: comments.items,
			files: files.items,
			truncated: { comments: comments.truncated, files: files.truncated },
		});
		return;
	}
	const lines = formatPullRequestView(detail, comments, files, Date.now(), options.allComments);
	await term.page(lines.join("\n"), { pager: options.pager });
}

export function formatPullRequestView(
	detail: PullRequestDetail,
	comments: CappedPage<PullRequestComment>,
	files: CappedPage<ChangedFile>,
	nowMs: number,
	allComments = false,
): string[] {
	const label = detail.draft ? "DRAFT" : detail.state || "-";
	return [
		kleur.bold(detail.title),
		...fieldLines([
			["State", colorForBitbucketState(label)(label)],
			["Author", detail.author],
			["Branch", branchLine(detail)],
			["Approvals", approvalCount(detail.reviewers)],
			["Created", dateWithAge(detail.createdOn, nowMs)],
			["Updated", dateWithAge(detail.updatedOn, nowMs)],
			["Closed by", detail.closedBy],
			["URL", detail.url],
		]),
		...markdownBody(detail.description),
		...reviewerSection(detail.reviewers),
		...fileSection(files),
		...commentSection(renderedPrComments(comments.items), {
			allComments,
			truncated: comments.truncated,
		}),
	];
}

export function reviewerSection(reviewers: Reviewer[]): string[] {
	const heading = ["", kleur.bold("Reviewers")];
	if (reviewers.length === 0) return [...heading, `  ${kleur.dim("None assigned")}`];
	const width = Math.max(...reviewers.map((r) => r.name.length));
	return [...heading, ...reviewers.map((r) => `  ${r.name.padEnd(width)}  ${reviewerState(r)}`)];
}

export function fileSection(files: CappedPage<ChangedFile>): string[] {
	if (files.items.length === 0) return [];
	const rows = files.items.map((file) => ({
		added: `+${file.added}`,
		removed: `-${file.removed}`,
		path: file.path,
	}));
	const wa = Math.max(...rows.map((r) => r.added.length));
	const wr = Math.max(...rows.map((r) => r.removed.length));
	const total = files.total ?? files.items.length;
	const added = sum(files.items, (f) => f.added);
	const removed = sum(files.items, (f) => f.removed);
	return [
		"",
		kleur.bold(`Files (${total}, +${added} -${removed})`),
		...rows.map(
			(r) =>
				`  ${kleur.green(r.added.padStart(wa))}  ${kleur.red(r.removed.padStart(wr))}  ${r.path}`,
		),
		...moreFilesLine(files),
	];
}

function moreFilesLine(files: CappedPage<ChangedFile>): string[] {
	if (!files.truncated) return [];
	const rest = files.total === undefined ? undefined : files.total - files.items.length;
	return [
		kleur.dim(rest === undefined ? "  ... more files not shown" : `  ... and ${rest} more`),
	];
}

function sum(files: ChangedFile[], pick: (file: ChangedFile) => number): number {
	return files.reduce((running, file) => running + pick(file), 0);
}

function reviewerState(reviewer: Reviewer): string {
	if (!reviewer.state) return kleur.dim("—");
	return colorForBitbucketState(reviewer.state)(reviewer.state);
}

function approvalCount(reviewers: Reviewer[]): string {
	const approved = reviewers.filter((r) => r.state === "APPROVED").length;
	return `${approved}/${reviewers.length}`;
}

function branchLine(detail: PullRequestDetail): string {
	if (!detail.sourceBranch || !detail.destinationBranch) {
		return detail.sourceBranch || detail.destinationBranch;
	}
	return `${detail.sourceBranch} → ${detail.destinationBranch}`;
}

function renderedPrComments(comments: PullRequestComment[]): RenderedComment[] {
	return comments.map((comment) => ({
		author: comment.author,
		created: comment.created,
		markdown: comment.body,
		anchor: comment.anchor,
	}));
}

function parseRef(arg: string | undefined): PullRequestRef {
	const ref = parsePullRequestRef(arg ?? "");
	if (!ref) {
		throw new Error(
			`Invalid pull request "${arg ?? ""}". Expected a PR number, e.g. 42, or a Bitbucket ` +
				"pull request URL.",
		);
	}
	return ref;
}

async function fetchDetail(
	session: BitbucketSession,
	repo: RepoRef,
	id: number,
): Promise<PullRequestDetail> {
	try {
		return await getPullRequest(session, repo, id);
	} catch (err) {
		if (err instanceof HttpError && err.status === 404) {
			throw new Error(`Pull request #${id} not found in ${repo.workspace}/${repo.repo}.`);
		}
		throw err;
	}
}
