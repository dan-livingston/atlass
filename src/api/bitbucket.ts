import type { RepoRef } from "../util/parse.ts";
import type { AtlassianClient } from "./client.ts";

import { HttpError } from "./client.ts";

// ---- API response shapes (subset of the fields atlass uses) ----

interface PipelineState {
	name?: string;
	// present when name is COMPLETED
	result?: { name?: string };
}

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

// ---- mapped summaries (also what --json emits) ----

export interface PipelineSummary {
	buildNumber: number;
	status: string;
	ref: string;
	// short commit hash; shown when a run has no branch/tag ref (commit target)
	commit: string;
	durationSeconds: number | null;
	createdOn: string;
	creator: string;
	uuid: string;
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

// ---- pure helpers ----

// A pipeline's state is COMPLETED + a result (SUCCESSFUL/FAILED/...) once done,
// otherwise a lifecycle name (PENDING/IN_PROGRESS/...). Show the result when
// complete, else the state name.
export function pipelineStatus(state: PipelineState | undefined): string {
	if (!state) return "";
	if (state.name === "COMPLETED") return state.result?.name ?? "COMPLETED";
	return state.name ?? "";
}

// The list endpoint is unusual in taking query params: newest first, page size
// clamped to the requested limit (Bitbucket caps pagelen at 100).
export function pipelinesQuery(limit: number): string {
	const pagelen = Math.min(Math.max(limit, 1), 100);
	return new URLSearchParams({ sort: "-created_on", pagelen: String(pagelen) }).toString();
}

// Whole elapsed seconds between two ISO timestamps, or null if either is missing
// or unparseable. Used for a step's runtime and a pipeline's wall-clock duration
// (build_seconds_used counts billable minutes, which are 0 on self-hosted
// runners, so it is not a reliable duration).
export function elapsedSeconds(
	startOn: string | undefined,
	endOn: string | undefined,
): number | null {
	if (!startOn || !endOn) return null;
	const start = Date.parse(startOn);
	const end = Date.parse(endOn);
	if (Number.isNaN(start) || Number.isNaN(end)) return null;
	return Math.floor((end - start) / 1000);
}

// ---- endpoints ----

// upper bound on the build-number fallback scan, so a missing number never pages
// forever through history.
const MAX_SCAN = 1000;

function repoPath(ref: RepoRef): string {
	return `/2.0/repositories/${encodeURIComponent(ref.workspace)}/${encodeURIComponent(ref.repo)}/pipelines`;
}

// A Bitbucket `next` link is an absolute URL on the same host; reduce it to the
// path+query the client appends to its origin.
function toPath(url: string): string {
	const u = new URL(url);
	return u.pathname + u.search;
}

// Walk a paginated 2.0 collection, yielding each value across pages by following
// the `next` link until it disappears. Callers decide when to stop.
async function* paginate<T>(client: AtlassianClient, firstPath: string): AsyncGenerator<T> {
	let path: string | null = firstPath;
	while (path) {
		const page: Paginated<T> = await client.getJson(path);
		for (const value of page.values ?? []) yield value;
		path = page.next ? toPath(page.next) : null;
	}
}

function mapPipeline(p: PipelineValue): PipelineSummary {
	return {
		buildNumber: p.build_number,
		status: pipelineStatus(p.state),
		ref: p.target?.ref_name ?? "",
		commit: p.target?.commit?.hash?.slice(0, 7) ?? "",
		durationSeconds: elapsedSeconds(p.created_on, p.completed_on),
		createdOn: p.created_on ?? "",
		creator: p.creator?.display_name ?? "",
		uuid: p.uuid,
	};
}

function mapDetail(p: PipelineValue): PipelineDetail {
	return {
		...mapPipeline(p),
		repo: p.repository?.full_name ?? "",
		trigger: p.trigger?.name ?? "",
	};
}

// List recent pipelines, newest first, following pagination until `limit` rows
// are gathered (or the results run out).
export async function listPipelines(
	client: AtlassianClient,
	ref: RepoRef,
	limit: number,
): Promise<PipelineSummary[]> {
	const out: PipelineSummary[] = [];
	const first = `${repoPath(ref)}?${pipelinesQuery(limit)}`;
	for await (const value of paginate<PipelineValue>(client, first)) {
		out.push(mapPipeline(value));
		if (out.length >= limit) break;
	}
	return out;
}

// Fetch one pipeline by its human build number. The path officially wants the
// pipeline uuid, but usually accepts the build number directly; try that first
// and fall back to scanning the (newest-first) list when the API rejects it.
export async function getPipeline(
	client: AtlassianClient,
	ref: RepoRef,
	buildNumber: number,
): Promise<PipelineDetail> {
	const base = repoPath(ref);
	try {
		const direct: PipelineValue = await client.getJson(
			`${base}/${encodeURIComponent(String(buildNumber))}`,
		);
		return mapDetail(direct);
	} catch (err) {
		if (!(err instanceof HttpError) || (err.status !== 400 && err.status !== 404)) throw err;
	}
	const found = await scanForBuild(client, ref, buildNumber);
	if (!found) {
		throw new Error(
			`Could not find pipeline #${buildNumber} in the ${MAX_SCAN} most recent runs. It may be too old.`,
		);
	}
	return mapDetail(found);
}

async function scanForBuild(
	client: AtlassianClient,
	ref: RepoRef,
	buildNumber: number,
): Promise<PipelineValue | null> {
	const first = `${repoPath(ref)}?${pipelinesQuery(100)}`;
	let scanned = 0;
	for await (const pipeline of paginate<PipelineValue>(client, first)) {
		if (pipeline.build_number === buildNumber) return pipeline;
		if (++scanned >= MAX_SCAN) break;
	}
	return null;
}

// List the steps of a pipeline, in order, following pagination to the end.
export async function listSteps(
	client: AtlassianClient,
	ref: RepoRef,
	pipelineId: string,
): Promise<StepSummary[]> {
	const out: StepSummary[] = [];
	const first = `${repoPath(ref)}/${encodeURIComponent(pipelineId)}/steps`;
	for await (const step of paginate<StepValue>(client, first)) {
		out.push({
			name: step.name ?? "",
			status: pipelineStatus(step.state),
			durationSeconds: elapsedSeconds(step.started_on, step.completed_on),
		});
	}
	return out;
}
