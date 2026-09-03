import type { PullRequestSummary } from "#/api/bitbucket-pull-requests.ts";
import type { SearchRow } from "#/commands/search-run.ts";
import type { BitbucketAuth } from "#/credentials.ts";

import {
	allPullRequestStates,
	listPullRequests,
	parsePullRequestStates,
	pullRequestQuery,
} from "#/api/bitbucket-pull-requests.ts";
import { fetchCurrentUserUuid } from "#/api/bitbucket-user.ts";
import { AtlassianClient } from "#/api/client.ts";
import {
	colorForBitbucketState,
	rememberBitbucketUuid,
	withScopeHint,
} from "#/commands/bitbucket.ts";
import { alignedRows, printRows, searchFooter } from "#/commands/search-run.ts";
import { requireBitbucketAuth } from "#/credentials.ts";
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

export async function bitbucketPrs(options: PrsOptions): Promise<void> {
	if (options.query && (options.author || options.reviewer)) {
		throw new Error("--query cannot be combined with --author or --reviewer.");
	}
	const states = pullRequestStates(options);
	const auth = await requireBitbucketAuth();
	const ref = resolveRepo(options.repo, auth);
	const client = new AtlassianClient(auth);
	const limit = parseLimit(options.limit);
	const query = pullRequestQuery({
		...(await resolvePrincipals(client, auth, options)),
		query: options.query,
	});
	const prs = await withScopeHint(PULL_REQUEST_SCOPE, () =>
		listPullRequests(client, ref, { limit, states, query }),
	);

	printRows(pullRequestRows(prs, Date.now()), {
		json: options.json,
		empty: emptyMessage(options),
		footer: prs.length === limit ? searchFooter(limit) : undefined,
	});
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
	client: AtlassianClient,
	auth: BitbucketAuth,
	options: PrsOptions,
): Promise<Principals> {
	const mine =
		isMe(options.author) || isMe(options.reviewer)
			? await currentUuid(client, auth)
			: undefined;
	return {
		author: isMe(options.author) ? mine : options.author,
		reviewer: isMe(options.reviewer) ? mine : options.reviewer,
	};
}

function isMe(value: string | undefined): boolean {
	return value?.toLowerCase() === "me";
}

async function currentUuid(client: AtlassianClient, auth: BitbucketAuth): Promise<string> {
	if (auth.uuid) return auth.uuid;
	const uuid = await withScopeHint(ACCOUNT_SCOPE, () => fetchCurrentUserUuid(client));
	await rememberBitbucketUuid(uuid);
	return uuid;
}

function emptyMessage(options: PrsOptions): string {
	const filtered =
		options.author || options.reviewer || options.query || options.state || options.all;
	return filtered ? "No matching pull requests." : "No open pull requests.";
}
