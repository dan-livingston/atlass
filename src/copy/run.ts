import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { DownloadedAttachment } from "#/api/attachments.ts";
import type { CopyPlan } from "#/copy/plan.ts";
import type { Terminal } from "#/terminal.ts";

import { renderCopy } from "#/copy/plan.ts";

export type FetchBytes = (url: string) => Promise<Uint8Array>;

export async function runCopy(
	term: Terminal,
	plan: CopyPlan,
	fetchBytes: FetchBytes,
): Promise<void> {
	const landed = await download(term, plan, fetchBytes);
	await mkdir(dirname(plan.filePath), { recursive: true });
	await writeFile(plan.filePath, renderCopy(plan, landed), "utf8");
	term.out(wroteLine(plan.filePath, landed.length));
}

async function download(
	term: Terminal,
	plan: CopyPlan,
	fetchBytes: FetchBytes,
): Promise<DownloadedAttachment[]> {
	if (plan.downloads.length === 0) return [];
	await mkdir(plan.assetsDir, { recursive: true });

	const landed: DownloadedAttachment[] = [];
	for (const { path, ...attachment } of plan.downloads) {
		try {
			await writeFile(path, await fetchBytes(attachment.url));
			landed.push(attachment);
		} catch (err) {
			term.err(`  ! could not download ${attachment.filename}: ${(err as Error).message}`);
		}
	}
	return landed;
}

function wroteLine(filePath: string, attachmentCount: number): string {
	const suffix =
		attachmentCount > 0
			? ` (+${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"})`
			: "";
	return `Wrote ${filePath}${suffix}`;
}
