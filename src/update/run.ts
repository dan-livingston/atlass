import { confirm } from "@inquirer/prompts";

import type { UpdatePlan } from "#/update/plan.ts";

import { formatPlan } from "#/update/plan.ts";

export interface RunOptions {
	dryRun?: boolean;
}

export async function runPlan(
	plan: UpdatePlan,
	options: RunOptions,
	push: () => Promise<void>,
): Promise<void> {
	if (options.dryRun) {
		for (const line of formatPlan(plan)) console.log(line);
		return;
	}
	const verdict = plan.verdict;
	if (verdict.kind === "refuse") throw new Error(verdict.message);
	if (verdict.kind === "confirm") {
		const ok = await confirm({ message: verdict.message, default: false });
		if (!ok) {
			console.log("Aborted.");
			return;
		}
	}
	await push();
}
