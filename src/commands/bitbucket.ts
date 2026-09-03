import { input, password } from "@inquirer/prompts";
import kleur from "kleur";

import type { PipelineDetail, PipelineSummary, StepSummary } from "#/api/bitbucket.ts";
import type { SearchRow } from "#/commands/search-run.ts";

import { getPipeline, listPipelines, listSteps } from "#/api/bitbucket.ts";
import { AtlassianClient, HttpError } from "#/api/client.ts";
import { alignedRows, printRows } from "#/commands/search-run.ts";
import { clearConfig, readConfig, writeConfig } from "#/config.ts";
import {
	BITBUCKET_ORIGIN,
	deleteBitbucketToken,
	readBitbucketToken,
	requireBitbucketAuth,
	saveBitbucketToken,
} from "#/credentials.ts";
import { formatDuration, relativeTime } from "#/util/format.ts";
import { parseLimit, resolveRepo } from "#/util/parse.ts";

interface Workspace {
	slug?: string;
	name?: string;
}

export async function bitbucketLogin(): Promise<void> {
	const existing = (await readConfig()) ?? {};
	const email = existing.email ?? (await input({ message: "Account email:", required: true }));
	const workspace = (
		await input({ message: "Bitbucket workspace (e.g. acme):", required: true })
	).trim();
	const defaultRepo =
		(await input({ message: "Default repo slug (optional):" })).trim() || undefined;
	const token = await password({
		message: "Bitbucket API token (needs read:pipeline + workspace read scopes):",
		mask: true,
	});

	const client = new AtlassianClient({ site: BITBUCKET_ORIGIN, email, token });
	const ws = await verifyWorkspace(client, workspace);

	await writeConfig({
		...existing,
		email,
		bitbucket: { workspace, ...(defaultRepo ? { defaultRepo } : {}) },
	});
	saveBitbucketToken(email, token);
	console.log(`Logged in to Bitbucket workspace ${ws.name ?? workspace} as ${email}.`);
}

export async function bitbucketLogout(): Promise<void> {
	const config = await readConfig();
	if (config?.email) deleteBitbucketToken(config.email);
	const jiraLogin =
		config?.site && config.email ? { site: config.site, email: config.email } : null;
	if (jiraLogin) await writeConfig(jiraLogin);
	else await clearConfig();
	console.log("Logged out of Bitbucket. Credentials removed.");
}

export async function bitbucketStatus(): Promise<void> {
	const config = await readConfig();
	if (!config?.email || !config.bitbucket?.workspace) {
		console.log("Not logged in to Bitbucket. Run `atlass bitbucket login`.");
		return;
	}
	const hasToken = readBitbucketToken(config.email) !== null;
	console.log(`Workspace:    ${config.bitbucket.workspace}`);
	console.log(`Email:        ${config.email}`);
	console.log(`Default repo: ${config.bitbucket.defaultRepo ?? "(none)"}`);
	console.log(
		`Token:        ${hasToken ? "stored in keyring" : "MISSING (run `atlass bitbucket login`)"}`,
	);
}

export interface PipelinesOptions {
	repo?: string;
	limit?: string;
	json?: boolean;
}

export async function bitbucketPipelines(options: PipelinesOptions): Promise<void> {
	const auth = await requireBitbucketAuth();
	const ref = resolveRepo(options.repo, auth);
	const client = new AtlassianClient(auth);
	const limit = parseLimit(options.limit);
	const pipelines = await withScopeHint(() => listPipelines(client, ref, limit));

	printRows(pipelineRows(pipelines, Date.now()), {
		json: options.json,
		empty: "No pipelines found.",
	});
}

export interface PipelineOptions {
	repo?: string;
}

export async function bitbucketPipeline(
	arg: string | undefined,
	options: PipelineOptions,
): Promise<void> {
	const buildNumber = parseBuildNumber(arg);
	const auth = await requireBitbucketAuth();
	const ref = resolveRepo(options.repo, auth);
	const client = new AtlassianClient(auth);
	const detail = await withScopeHint(() => getPipeline(client, ref, buildNumber));
	const steps = await withScopeHint(() => listSteps(client, ref, detail.uuid));
	printPipelineDetail(detail, steps, Date.now());
}

export function pipelineRows(pipelines: PipelineSummary[], nowMs: number): SearchRow[] {
	return alignedRows(pipelines, nowMs, (p) => ({
		id: `#${p.buildNumber}`,
		url: p.url,
		label: p.status || "-",
		color: colorForBitbucketState(p.status),
		text: `${refWithCommit(p)}  ${formatDuration(p.durationSeconds)}`,
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

function printPipelineDetail(detail: PipelineDetail, steps: StepSummary[], nowMs: number): void {
	console.log(`Pipeline #${detail.buildNumber}  ${detail.status || "-"}`);
	if (detail.repo) console.log(`Repo:     ${detail.repo}`);
	console.log(`Ref:      ${refWithCommit(detail)}`);
	if (detail.trigger) console.log(`Trigger:  ${detail.trigger}`);
	console.log(`Duration: ${formatDuration(detail.durationSeconds)}`);
	const by = detail.creator ? ` by ${detail.creator}` : "";
	console.log(`Created:  ${relativeTime(detail.createdOn, nowMs)}${by}`);
	if (steps.length > 0) {
		console.log("");
		console.log("Steps:");
		for (const line of formatStepRows(steps)) console.log(line);
	}
}

function refWithCommit(pipeline: Pick<PipelineSummary, "ref" | "commit">): string {
	if (!pipeline.ref) return pipeline.commit || "-";
	return pipeline.commit ? `${pipeline.ref} (${pipeline.commit})` : pipeline.ref;
}

async function verifyWorkspace(client: AtlassianClient, workspace: string): Promise<Workspace> {
	try {
		return await client.getJson<Workspace>(`/2.0/workspaces/${encodeURIComponent(workspace)}`);
	} catch (err) {
		if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
			throw new Error(
				`Could not verify Bitbucket workspace "${workspace}" (401/403). Check the token ` +
					`and that it has workspace read + read:pipeline:bitbucket scopes.`,
			);
		}
		if (err instanceof HttpError && err.status === 404) {
			throw new Error(`Bitbucket workspace "${workspace}" not found (404). Check the slug.`);
		}
		throw err;
	}
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

async function withScopeHint<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
			throw new Error(
				"Bitbucket rejected the request (401/403). Check the token has the " +
					"read:pipeline:bitbucket scope, or run `atlass bitbucket login` to update it.",
			);
		}
		throw err;
	}
}
