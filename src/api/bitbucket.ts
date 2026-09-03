import type { AtlassianClient } from "#/api/client.ts";
import type { RepoRef } from "#/util/parse.ts";

import { HttpError, pathAndQuery } from "#/api/client.ts";

interface CompletedState {
	name: "COMPLETED";
	result?: { name?: string };
}

interface LifecycleState {
	name?: string;
	result?: undefined;
}

type PipelineState = CompletedState | LifecycleState;

interface PipelineValue {
	uuid: string;
	build_number: number;
	state?: PipelineState;
	target?: { ref_name?: string; commit?: { hash?: string } };
	trigger?: { name?: string };
	creator?: { display_name?: string };
	created_on?: string;
	completed_on?: string;
	repository?: { full_name?: string };
}

interface StepValue {
	uuid: string;
	name?: string;
	state?: PipelineState;
	started_on?: string;
	completed_on?: string;
}

interface Paginated<T> {
	values?: T[];
	next?: string;
}

export interface PipelineSummary {
	buildNumber: number;
	status: string;
	ref: string;
	commit: string;
	durationSeconds: number | null;
	createdOn: string;
	creator: string;
	uuid: string;
	url: string;
}

export interface PipelineDetail extends PipelineSummary {
	repo: string;
	trigger: string;
}

export interface StepSummary {
	name: string;
	status: string;
	durationSeconds: number | null;
}

const BITBUCKET_WEB_ORIGIN = "https://bitbucket.org";
const BITBUCKET_MAX_PAGELEN = 100;
const BUILD_NUMBER_SCAN_LIMIT = 1000;

export function pipelineStatus(state: PipelineState | undefined): string {
	if (!state) return "";
	if (state.name === "COMPLETED") return state.result?.name ?? "COMPLETED";
	return state.name ?? "";
}

export function pipelinesQuery(limit: number): string {
	const pagelen = Math.min(Math.max(limit, 1), BITBUCKET_MAX_PAGELEN);
	return new URLSearchParams({ sort: "-created_on", pagelen: String(pagelen) }).toString();
}

export function wallClockSeconds(
	startOn: string | undefined,
	endOn: string | undefined,
): number | null {
	if (!startOn || !endOn) return null;
	const start = Date.parse(startOn);
	const end = Date.parse(endOn);
	if (Number.isNaN(start) || Number.isNaN(end)) return null;
	return Math.floor((end - start) / 1000);
}

function shortHash(hash: string | undefined): string {
	return hash?.slice(0, 7) ?? "";
}

export function pipelineUrl(ref: RepoRef, buildNumber: number): string {
	return `${BITBUCKET_WEB_ORIGIN}/${ref.workspace}/${ref.repo}/pipelines/results/${buildNumber}`;
}

export function toPipelineSummary(ref: RepoRef, p: PipelineValue): PipelineSummary {
	return {
		buildNumber: p.build_number,
		status: pipelineStatus(p.state),
		ref: p.target?.ref_name ?? "",
		commit: shortHash(p.target?.commit?.hash),
		durationSeconds: wallClockSeconds(p.created_on, p.completed_on),
		createdOn: p.created_on ?? "",
		creator: p.creator?.display_name ?? "",
		uuid: p.uuid,
		url: pipelineUrl(ref, p.build_number),
	};
}

function toPipelineDetail(ref: RepoRef, p: PipelineValue): PipelineDetail {
	return {
		...toPipelineSummary(ref, p),
		repo: p.repository?.full_name ?? "",
		trigger: p.trigger?.name ?? "",
	};
}

function toStepSummary(step: StepValue): StepSummary {
	return {
		name: step.name ?? "",
		status: pipelineStatus(step.state),
		durationSeconds: wallClockSeconds(step.started_on, step.completed_on),
	};
}

function repoPath(ref: RepoRef, resource: string): string {
	return `/2.0/repositories/${encodeURIComponent(ref.workspace)}/${encodeURIComponent(ref.repo)}/${resource}`;
}

function pipelinesPath(ref: RepoRef): string {
	return repoPath(ref, "pipelines");
}

async function* walkPages<T>(client: AtlassianClient, firstPath: string): AsyncGenerator<T> {
	let path: string | null = firstPath;
	while (path) {
		const page: Paginated<T> = await client.getJson(path);
		for (const value of page.values ?? []) yield value;
		path = page.next ? pathAndQuery(page.next) : null;
	}
}

async function collectPages<V, T>(
	client: AtlassianClient,
	first: string,
	limit: number,
	map: (value: V) => T,
): Promise<T[]> {
	const out: T[] = [];
	for await (const value of walkPages<V>(client, first)) {
		out.push(map(value));
		if (out.length >= limit) break;
	}
	return out;
}

export async function listPipelines(
	client: AtlassianClient,
	ref: RepoRef,
	limit: number,
): Promise<PipelineSummary[]> {
	const first = `${pipelinesPath(ref)}?${pipelinesQuery(limit)}`;
	return collectPages<PipelineValue, PipelineSummary>(client, first, limit, (value) =>
		toPipelineSummary(ref, value),
	);
}

export async function getPipeline(
	client: AtlassianClient,
	ref: RepoRef,
	buildNumber: number,
): Promise<PipelineDetail> {
	const found =
		(await fetchByBuildNumber(client, ref, buildNumber)) ??
		(await findInRecentRuns(client, ref, buildNumber));
	if (!found) {
		throw new Error(
			`Could not find pipeline #${buildNumber} in the ${BUILD_NUMBER_SCAN_LIMIT} most recent runs. It may be too old.`,
		);
	}
	return toPipelineDetail(ref, found);
}

async function fetchByBuildNumber(
	client: AtlassianClient,
	ref: RepoRef,
	buildNumber: number,
): Promise<PipelineValue | null> {
	try {
		return await client.getJson(
			`${pipelinesPath(ref)}/${encodeURIComponent(String(buildNumber))}`,
		);
	} catch (err) {
		if (err instanceof HttpError && (err.status === 400 || err.status === 404)) return null;
		throw err;
	}
}

async function findInRecentRuns(
	client: AtlassianClient,
	ref: RepoRef,
	buildNumber: number,
): Promise<PipelineValue | null> {
	const first = `${pipelinesPath(ref)}?${pipelinesQuery(BITBUCKET_MAX_PAGELEN)}`;
	let scanned = 0;
	for await (const pipeline of walkPages<PipelineValue>(client, first)) {
		if (pipeline.build_number === buildNumber) return pipeline;
		if (++scanned >= BUILD_NUMBER_SCAN_LIMIT) break;
	}
	return null;
}

export async function listSteps(
	client: AtlassianClient,
	ref: RepoRef,
	pipelineId: string,
): Promise<StepSummary[]> {
	const out: StepSummary[] = [];
	const first = `${pipelinesPath(ref)}/${encodeURIComponent(pipelineId)}/steps`;
	for await (const step of walkPages<StepValue>(client, first)) {
		out.push(toStepSummary(step));
	}
	return out;
}

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
	client: AtlassianClient,
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

export async function fetchCurrentUserUuid(client: AtlassianClient): Promise<string> {
	const user = await client.getJson<{ uuid?: string }>("/2.0/user");
	if (!user.uuid) {
		throw new Error("Bitbucket did not return an account uuid for the current user.");
	}
	return user.uuid;
}
