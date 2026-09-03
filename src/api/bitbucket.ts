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

function repoPath(ref: RepoRef): string {
	return `/2.0/repositories/${encodeURIComponent(ref.workspace)}/${encodeURIComponent(ref.repo)}/pipelines`;
}

async function* walkPages<T>(client: AtlassianClient, firstPath: string): AsyncGenerator<T> {
	let path: string | null = firstPath;
	while (path) {
		const page: Paginated<T> = await client.getJson(path);
		for (const value of page.values ?? []) yield value;
		path = page.next ? pathAndQuery(page.next) : null;
	}
}

export async function listPipelines(
	client: AtlassianClient,
	ref: RepoRef,
	limit: number,
): Promise<PipelineSummary[]> {
	const out: PipelineSummary[] = [];
	const first = `${repoPath(ref)}?${pipelinesQuery(limit)}`;
	for await (const value of walkPages<PipelineValue>(client, first)) {
		out.push(toPipelineSummary(ref, value));
		if (out.length >= limit) break;
	}
	return out;
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
		return await client.getJson(`${repoPath(ref)}/${encodeURIComponent(String(buildNumber))}`);
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
	const first = `${repoPath(ref)}?${pipelinesQuery(BITBUCKET_MAX_PAGELEN)}`;
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
	const first = `${repoPath(ref)}/${encodeURIComponent(pipelineId)}/steps`;
	for await (const step of walkPages<StepValue>(client, first)) {
		out.push(toStepSummary(step));
	}
	return out;
}
