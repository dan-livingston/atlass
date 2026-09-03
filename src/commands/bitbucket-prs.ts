import type { PullRequestSummary } from "#/api/bitbucket-pull-requests.ts";
import type { BitbucketSession } from "#/api/session.ts";
import type { SearchRow } from "#/commands/search-run.ts";
import type { Env } from "#/env.ts";

import {
	allPullRequestStates,
	listPullRequests,
	parsePullRequestStates,
	pullRequestQuery,
} from "#/api/bitbucket-pull-requests.ts";
import { fetchCurrentUserUuid } from "#/api/bitbucket-user.ts";
import {
	colorForBitbucketState,
	rememberBitbucketUuid,
	withScopeHint,
} from "#/commands/bitbucket.ts";
import { alignedRows, formatRows, searchFooter } from "#/commands/search-run.ts";
import { parseLimit, resolveRepo } from "#/util/parse.ts";

export interface PrsOptions {
	repo?: string;
	state?: string[];
	all?: boolean;
	author?: string;
	reviewer?: string;
	query?: string;
	limit?: string;
	json?: boolean;
}

const PULL_REQUEST_SCOPE = "read:pullrequest:bitbucket";
const ACCOUNT_SCOPE = "read:account";

export async function bitbucketPrs(
	{ session, term }: Env<BitbucketSession>,
	options: PrsOptions,
): Promise<void> {
	if (options.query && (options.author || options.reviewer)) {
		throw new Error("--query cannot be combined with --author or --reviewer.");
	}
	const states = pullRequestStates(options);
	const ref = resolveRepo(options.repo, session);
	const limit = parseLimit(options.limit);
	const query = pullRequestQuery({
		...(await resolvePrincipals(session, options)),
		query: options.query,
	});
	const prs = await withScopeHint(PULL_REQUEST_SCOPE, () =>
		listPullRequests(session, ref, { limit, states, query }),
	);

	const rows = pullRequestRows(prs, Date.now());
	if (options.json) term.json(rows.map((r) => r.json));
	else
		term.out(
			formatRows(rows, {
				empty: emptyMessage(options),
				footer: prs.length === limit ? searchFooter(limit) : undefined,
				width: term.width,
			}),
		);
}

export function pullRequestStates(options: Pick<PrsOptions, "state" | "all">): string[] {
	if (!options.all) return parsePullRequestStates(options.state);
	if (options.state) throw new Error("--all cannot be combined with --state.");
	return allPullRequestStates();
}

export function pullRequestRows(prs: PullRequestSummary[], nowMs: number): SearchRow[] {
	return alignedRows(prs, nowMs, (pr) => {
		const label = pr.draft ? "DRAFT" : pr.state || "-";
		return {
			id: `#${pr.id}`,
			url: pr.url,
			label,
			color: colorForBitbucketState(label),
			text: pr.title,
			timestamp: pr.updatedOn,
		};
	});
}

interface Principals {
	author?: string;
	reviewer?: string;
}

async function resolvePrincipals(
	session: BitbucketSession,
	options: PrsOptions,
): Promise<Principals> {
	const mine =
		isMe(options.author) || isMe(options.reviewer) ? await currentUuid(session) : undefined;
	return {
		author: isMe(options.author) ? mine : options.author,
		reviewer: isMe(options.reviewer) ? mine : options.reviewer,
	};
}

function isMe(value: string | undefined): boolean {
	return value?.toLowerCase() === "me";
}

async function currentUuid(session: BitbucketSession): Promise<string> {
	if (session.uuid) return session.uuid;
	const uuid = await withScopeHint(ACCOUNT_SCOPE, () => fetchCurrentUserUuid(session));
	await rememberBitbucketUuid(uuid);
	return uuid;
}

function emptyMessage(options: PrsOptions): string {
	const filtered =
		options.author || options.reviewer || options.query || options.state || options.all;
	return filtered ? "No matching pull requests." : "No open pull requests.";
}
