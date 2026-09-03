import type { DownloadedAttachment } from "#/api/attachments.ts";
import type { CopyPlan } from "#/copy/plan.ts";
import type { SessionEnv } from "#/env.ts";

import { renderCopy } from "#/copy/plan.ts";

export async function runCopy(env: SessionEnv, plan: CopyPlan): Promise<void> {
	const landed = await download(env, plan);
	await env.files.writeText(plan.filePath, renderCopy(plan, landed));
	env.term.out(wroteLine(plan.filePath, landed.length));
}

async function download(
	{ term, files, session }: SessionEnv,
	plan: CopyPlan,
): Promise<DownloadedAttachment[]> {
	const landed: DownloadedAttachment[] = [];
	for (const { path, ...attachment } of plan.downloads) {
		try {
			await files.writeBytes(path, await session.getBinary(attachment.url));
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
