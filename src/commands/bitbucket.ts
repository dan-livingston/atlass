import kleur from "kleur";

import type { PipelineDetail, PipelineSummary, StepSummary } from "#/api/bitbucket-pipelines.ts";
import type { BitbucketSession } from "#/api/session.ts";
import type { SearchRow } from "#/commands/search-run.ts";
import type { SessionEnv } from "#/env.ts";

import { getPipeline, listPipelines, listSteps } from "#/api/bitbucket-pipelines.ts";
import { HttpError } from "#/api/http-error.ts";
import { alignedRows, writeRows } from "#/commands/search-run.ts";
import { formatDuration, relativeTime } from "#/util/format.ts";
import { parseLimit, resolveRepo } from "#/util/parse.ts";

export interface PipelinesOptions {
	repo?: string;
	limit?: string;
	json?: boolean;
}

export async function bitbucketPipelines(
	{ session, term }: SessionEnv<BitbucketSession>,
	options: PipelinesOptions,
): Promise<void> {
	const ref = resolveRepo(options.repo, session);
	const limit = parseLimit(options.limit);
	const pipelines = await withScopeHint(PIPELINE_SCOPE, () => listPipelines(session, ref, limit));

	writeRows(term, pipelineRows(pipelines, Date.now()), {
		json: options.json,
		empty: "No pipelines found.",
	});
}

export interface PipelineOptions {
	repo?: string;
}

export async function bitbucketPipeline(
	{ session, term }: SessionEnv<BitbucketSession>,
	arg: string | undefined,
	options: PipelineOptions,
): Promise<void> {
	const buildNumber = parseBuildNumber(arg);
	const ref = resolveRepo(options.repo, session);
	const detail = await withScopeHint(PIPELINE_SCOPE, () =>
		getPipeline(session, ref, buildNumber),
	);
	const steps = await withScopeHint(PIPELINE_SCOPE, () => listSteps(session, ref, detail.uuid));
	term.out(formatPipelineDetail(detail, steps, Date.now()));
}

export function pipelineRows(pipelines: PipelineSummary[], nowMs: number): SearchRow[] {
	return alignedRows(pipelines, nowMs, (p) => ({
		id: `#${p.buildNumber}`,
		url: p.url,
		label: p.status || "-",
		color: colorForBitbucketState(p.status),
		text: `${refWithCommit(p)} · ${formatDuration(p.durationSeconds)}`,
		timestamp: p.createdOn,
	}));
}

const STATE_COLORS: Record<string, (text: string) => string> = {
	SUCCESSFUL: kleur.green,
	MERGED: kleur.green,
	FAILED: kleur.red,
	ERROR: kleur.red,
	DECLINED: kleur.red,
	IN_PROGRESS: kleur.yellow,
	PENDING: kleur.yellow,
	OPEN: kleur.yellow,
	PAUSED: kleur.cyan,
	STOPPED: kleur.gray,
	SUPERSEDED: kleur.gray,
	DRAFT: kleur.gray,
};

export function colorForBitbucketState(state: string): (text: string) => string {
	return STATE_COLORS[state.toUpperCase()] ?? kleur.white;
}

export function formatStepRows(steps: StepSummary[]): string[] {
	const rows = steps.map((s) => ({
		name: s.name || "-",
		status: s.status || "-",
		dur: formatDuration(s.durationSeconds),
	}));
	const wn = Math.max(...rows.map((r) => r.name.length));
	const ws = Math.max(...rows.map((r) => r.status.length));
	return rows.map((r) => `  ${r.name.padEnd(wn)}  ${r.status.padEnd(ws)}  ${r.dur}`);
}

export function formatPipelineDetail(
	detail: PipelineDetail,
	steps: StepSummary[],
	nowMs: number,
): string[] {
	const by = detail.creator ? ` by ${detail.creator}` : "";
	return [
		`Pipeline #${detail.buildNumber}  ${detail.status || "-"}`,
		...(detail.repo ? [`Repo:     ${detail.repo}`] : []),
		`Ref:      ${refWithCommit(detail)}`,
		...(detail.trigger ? [`Trigger:  ${detail.trigger}`] : []),
		`Duration: ${formatDuration(detail.durationSeconds)}`,
		`Created:  ${relativeTime(detail.createdOn, nowMs)}${by}`,
		...(steps.length > 0 ? ["", "Steps:", ...formatStepRows(steps)] : []),
	];
}

function refWithCommit(pipeline: Pick<PipelineSummary, "ref" | "commit">): string {
	if (!pipeline.ref) return pipeline.commit || "-";
	return pipeline.commit ? `${pipeline.ref} (${pipeline.commit})` : pipeline.ref;
}

function parseBuildNumber(arg: string | undefined): number {
	const raw = (arg ?? "").replace(/^#/, "").trim();
	if (!/^\d+$/.test(raw)) {
		throw new Error(
			`Invalid pipeline number "${arg ?? ""}". Expected a build number, e.g. 123.`,
		);
	}
	return Number.parseInt(raw, 10);
}

const PIPELINE_SCOPE = "read:pipeline:bitbucket";

export async function withScopeHint<T>(scope: string, fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
			throw new Error(
				`Bitbucket rejected the request (401/403). Check the token has the ${scope} ` +
					"scope, or run `atlass bitbucket login` to update it.",
			);
		}
		throw err;
	}
}
