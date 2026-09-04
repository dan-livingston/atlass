import type { CappedPage } from "#/api/bitbucket-repo.ts";
import type { Transport } from "#/api/client.ts";
import type { RepoRef } from "#/util/parse.ts";

import { pullRequestUrl } from "#/api/bitbucket-pull-requests.ts";
import { collectCapped, repoPath } from "#/api/bitbucket-repo.ts";

export const COMMENT_CAP = 200;
export const FILE_CAP = 50;

const PAGELEN = 100;

export interface Reviewer {
	name: string;
	state: string;
}

export interface PullRequestDetail {
	id: number;
	title: string;
	description: string;
	state: string;
	draft: boolean;
	author: string;
	sourceBranch: string;
	destinationBranch: string;
	closedBy: string;
	createdOn: string;
	updatedOn: string;
	url: string;
	reviewers: Reviewer[];
}

export interface PullRequestComment {
	author: string;
	created: string;
	body: string;
	anchor: string;
}

export interface ChangedFile {
	path: string;
	status: string;
	added: number;
	removed: number;
}

interface Principal {
	display_name?: string;
	uuid?: string;
}

interface Participant {
	user?: Principal;
	role?: string;
	approved?: boolean;
	state?: string | null;
}

interface PullRequestDetailValue {
	id: number;
	title?: string;
	description?: string;
	state?: string;
	draft?: boolean;
	author?: Principal;
	source?: { branch?: { name?: string } };
	destination?: { branch?: { name?: string } };
	closed_by?: Principal;
	created_on?: string;
	updated_on?: string;
	participants?: Participant[];
	reviewers?: Principal[];
}

interface CommentValue {
	content?: { raw?: string };
	user?: Principal;
	created_on?: string;
	deleted?: boolean;
	inline?: { path?: string; to?: number | null; from?: number | null };
}

interface DiffStatValue {
	status?: string;
	lines_added?: number;
	lines_removed?: number;
	old?: { path?: string } | null;
	new?: { path?: string } | null;
}

function pullRequestPath(ref: RepoRef, id: number, resource?: string): string {
	const base = `${repoPath(ref, "pullrequests")}/${id}`;
	return resource ? `${base}/${resource}` : base;
}

export function toPullRequestDetail(
	ref: RepoRef,
	value: PullRequestDetailValue,
): PullRequestDetail {
	return {
		id: value.id,
		title: value.title ?? "",
		description: value.description ?? "",
		state: value.state ?? "",
		draft: value.draft ?? false,
		author: value.author?.display_name ?? "",
		sourceBranch: value.source?.branch?.name ?? "",
		destinationBranch: value.destination?.branch?.name ?? "",
		closedBy: value.closed_by?.display_name ?? "",
		createdOn: value.created_on ?? "",
		updatedOn: value.updated_on ?? "",
		url: pullRequestUrl(ref, value.id),
		reviewers: toReviewers(value),
	};
}

function toReviewers(value: PullRequestDetailValue): Reviewer[] {
	const rows = new Map<string, Reviewer>();
	for (const requested of value.reviewers ?? []) {
		rows.set(principalKey(requested), { name: requested.display_name ?? "", state: "" });
	}
	for (const participant of value.participants ?? []) {
		const state = participantState(participant);
		if (participant.role !== "REVIEWER" && !state) continue;
		rows.set(principalKey(participant.user ?? {}), {
			name: participant.user?.display_name ?? "",
			state,
		});
	}
	return [...rows.values()];
}

function participantState(participant: Participant): string {
	if (participant.state) return participant.state.toUpperCase();
	return participant.approved ? "APPROVED" : "";
}

function principalKey(user: Principal): string {
	return user.uuid ?? user.display_name ?? "";
}

export function toComment(value: CommentValue): PullRequestComment | null {
	if (value.deleted) return null;
	const body = value.content?.raw ?? "";
	if (!body.trim()) return null;
	return {
		author: value.user?.display_name ?? "",
		created: value.created_on ?? "",
		body,
		anchor: inlineAnchor(value),
	};
}

function inlineAnchor(value: CommentValue): string {
	const path = value.inline?.path;
	if (!path) return "";
	const line = value.inline?.to ?? value.inline?.from;
	return line == null ? path : `${path}:${line}`;
}

export function toChangedFile(value: DiffStatValue): ChangedFile {
	const before = value.old?.path ?? "";
	const after = value.new?.path ?? "";
	return {
		path: before && after && before !== after ? `${before} -> ${after}` : after || before,
		status: value.status ?? "",
		added: value.lines_added ?? 0,
		removed: value.lines_removed ?? 0,
	};
}

export async function getPullRequest(
	client: Transport,
	ref: RepoRef,
	id: number,
): Promise<PullRequestDetail> {
	const value = await client.getJson<PullRequestDetailValue>(pullRequestPath(ref, id));
	return toPullRequestDetail(ref, value);
}

export async function listComments(
	client: Transport,
	ref: RepoRef,
	id: number,
): Promise<CappedPage<PullRequestComment>> {
	const first = `${pullRequestPath(ref, id, "comments")}?pagelen=${PAGELEN}`;
	const page = await collectCapped<CommentValue, PullRequestComment | null>(
		client,
		first,
		COMMENT_CAP,
		toComment,
	);
	const items = page.items
		.filter((comment) => comment !== null)
		.sort((a, b) => a.created.localeCompare(b.created));
	return { ...page, items };
}

export async function listChangedFiles(
	client: Transport,
	ref: RepoRef,
	id: number,
): Promise<CappedPage<ChangedFile>> {
	const first = `${pullRequestPath(ref, id, "diffstat")}?pagelen=${PAGELEN}`;
	return collectCapped<DiffStatValue, ChangedFile>(client, first, FILE_CAP, toChangedFile);
}
