import type { Transport } from "#/api/client.ts";
import type { RepoRef } from "#/util/parse.ts";

import {
	BITBUCKET_MAX_PAGELEN,
	BITBUCKET_WEB_ORIGIN,
	collectPages,
	repoPath,
} from "#/api/bitbucket-repo.ts";

export interface PullRequestSummary {
	id: number;
	title: string;
	state: string;
	draft: boolean;
	author: string;
	authorUuid: string;
	sourceBranch: string;
	destinationBranch: string;
	commentCount: number;
	createdOn: string;
	updatedOn: string;
	url: string;
}

interface PullRequestValue {
	id: number;
	title?: string;
	state?: string;
	draft?: boolean;
	author?: { display_name?: string; uuid?: string };
	source?: { branch?: { name?: string } };
	destination?: { branch?: { name?: string } };
	comment_count?: number;
	created_on?: string;
	updated_on?: string;
}

const PULL_REQUEST_STATES = ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"];

export function parsePullRequestStates(values: string[] | undefined): string[] {
	const raw = (values ?? []).flatMap((value) => value.split(","));
	const states: string[] = [];
	for (const value of raw) {
		const state = value.trim().toUpperCase();
		if (!state) continue;
		if (!PULL_REQUEST_STATES.includes(state)) {
			throw new Error(
				`Invalid --state "${value.trim()}". Expected ${PULL_REQUEST_STATES.map((s) =>
					s.toLowerCase(),
				)
					.join(", ")
					.replace(/, (?=[^,]*$)/, ", or ")}.`,
			);
		}
		if (!states.includes(state)) states.push(state);
	}
	return states;
}

export function allPullRequestStates(): string[] {
	return [...PULL_REQUEST_STATES];
}

export interface PullRequestFilters {
	author?: string;
	reviewer?: string;
	query?: string;
}

const PRINCIPAL_UUID = /^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/i;
const PRINCIPAL_ACCOUNT_ID = /^(?:[0-9a-z_-]{2,}[:|][0-9a-z|_-]{8,}|[0-9a-f]{24})$/i;

function principalTerm(field: string, flag: string, value: string): string {
	if (PRINCIPAL_UUID.test(value)) return `${field}.uuid = "${value}"`;
	if (PRINCIPAL_ACCOUNT_ID.test(value)) return `${field}.account_id = "${value}"`;
	throw new Error(`Invalid ${flag} "${value}". Expected me, an account id, or a uuid in braces.`);
}

export function pullRequestQuery(filters: PullRequestFilters): string | undefined {
	if (filters.query) {
		if (/\bstate\b/i.test(filters.query)) {
			throw new Error("--query cannot mention state; use --state instead.");
		}
		return filters.query;
	}
	const terms: string[] = [];
	if (filters.author) terms.push(principalTerm("author", "--author", filters.author));
	if (filters.reviewer) terms.push(principalTerm("reviewers", "--reviewer", filters.reviewer));
	if (terms.length === 0) return undefined;
	return terms.length === 1 ? terms[0] : `(${terms.join(" OR ")})`;
}

export interface PullRequestsParams {
	limit: number;
	states: string[];
	query?: string;
}

export function pullRequestsQuery(params: PullRequestsParams): string {
	const pagelen = Math.min(Math.max(params.limit, 1), BITBUCKET_MAX_PAGELEN);
	const search = new URLSearchParams({ sort: "-updated_on", pagelen: String(pagelen) });
	for (const state of params.states) search.append("state", state);
	if (params.query) search.append("q", params.query);
	return search.toString();
}

export function pullRequestUrl(ref: RepoRef, id: number): string {
	return `${BITBUCKET_WEB_ORIGIN}/${ref.workspace}/${ref.repo}/pull-requests/${id}`;
}

export function toPullRequestSummary(ref: RepoRef, pr: PullRequestValue): PullRequestSummary {
	return {
		id: pr.id,
		title: pr.title ?? "",
		state: pr.state ?? "",
		draft: pr.draft ?? false,
		author: pr.author?.display_name ?? "",
		authorUuid: pr.author?.uuid ?? "",
		sourceBranch: pr.source?.branch?.name ?? "",
		destinationBranch: pr.destination?.branch?.name ?? "",
		commentCount: pr.comment_count ?? 0,
		createdOn: pr.created_on ?? "",
		updatedOn: pr.updated_on ?? "",
		url: pullRequestUrl(ref, pr.id),
	};
}

export async function listPullRequests(
	client: Transport,
	ref: RepoRef,
	params: PullRequestsParams,
): Promise<PullRequestSummary[]> {
	const first = `${repoPath(ref, "pullrequests")}?${pullRequestsQuery(params)}`;
	return collectPages<PullRequestValue, PullRequestSummary>(
		client,
		first,
		params.limit,
		(value) => toPullRequestSummary(ref, value),
	);
}
