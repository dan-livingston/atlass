import type { PromptSpec, Terminal } from "#/terminal.ts";
import type { UpdatePlan } from "#/update/plan.ts";

import { NotInteractiveError } from "#/terminal.ts";
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
	const verdict = plan.verdict;
	if (options.dryRun) {
		term.out(formatPlan(plan));
		if (verdict.kind === "refuse") throw new Error(verdict.message);
		if (verdict.kind === "confirm" && !term.interactive) {
			throw new NotInteractiveError(forcePrompt(verdict.message));
		}
		return;
	}
	for (const warning of plan.warnings) term.err(`warning: ${warning}`);
	if (verdict.kind === "refuse") throw new Error(verdict.message);
	if (verdict.kind === "confirm") {
		const ok = await term.ask.confirm({ ...forcePrompt(verdict.message), default: false });
		if (!ok) {
			term.out("Aborted.");
			return;
		}
	}
	await push();
}

function forcePrompt(message: string): PromptSpec {
	return { message, flag: "--force" };
}
