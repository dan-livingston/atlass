import type { Terminal } from "#/terminal.ts";
import type { UpdatePlan } from "#/update/plan.ts";

import { formatPlan } from "#/update/plan.ts";

export interface RunOptions {
	dryRun?: boolean;
}

export async function runPlan(
	term: Terminal,
	plan: UpdatePlan,
	options: RunOptions,
	push: () => Promise<void>,
): Promise<void> {
	if (options.dryRun) {
		term.out(formatPlan(plan));
		return;
	}
	const verdict = plan.verdict;
	if (verdict.kind === "refuse") throw new Error(verdict.message);
	if (verdict.kind === "confirm") {
		const ok = await term.ask.confirm({
			message: verdict.message,
			flag: "--force",
			default: false,
		});
		if (!ok) {
			term.out("Aborted.");
			return;
		}
	}
	await push();
}
