import type { SprintState, SprintSummary } from "#/api/jira-types.ts";
import type { SessionEnv } from "#/env.ts";

import { HttpError } from "#/api/http-error.ts";
import { listSprints } from "#/api/jira-sprints.ts";
import { SPRINT_STATES } from "#/api/jira-types.ts";
import { withBoard } from "#/commands/board-ref.ts";
import { searchFooter } from "#/commands/search-run.ts";
import { formatDate, orList } from "#/util/format.ts";
import { parseChoices, parseLimit } from "#/util/parse.ts";

export interface SprintsOptions {
	state?: string[];
	limit?: string;
	json?: boolean;
}

export async function jiraSprints(
	{ session, term }: SessionEnv,
	ref: string,
	options: SprintsOptions,
): Promise<void> {
	const chosen = parseChoices(options.state, SPRINT_STATES, "--state");
	const states: SprintState[] = chosen.length > 0 ? chosen : ["active"];
	const limit = parseLimit(options.limit);
	const sprints = await withBoard(session, ref, (id) =>
		listSprints(session, id, states).catch((err: unknown) => {
			throw withoutSprints(err, id);
		}),
	);
	const shown = sprints.slice(0, limit);

	if (options.json) term.json(shown);
	else if (shown.length === 0) term.out(`No ${orList(states)} sprints.`);
	else if (sprints.length > limit) term.out([...formatSprintRows(shown), searchFooter(limit)]);
	else term.out(formatSprintRows(shown));
}

function withoutSprints(err: unknown, id: number): unknown {
	if (!(err instanceof HttpError) || err.status !== 400) return err;
	return new Error(`Board ${id} does not support sprints. Only scrum boards have them.`);
}

function formatSprintRows(sprints: SprintSummary[]): string[] {
	const cells = sprints.map((s) => [
		String(s.id),
		s.state,
		s.name,
		s.start ? formatDate(s.start) : "-",
		s.end ? formatDate(s.end) : "-",
	]);
	const widths = cells[0]!.map((_, i) => Math.max(...cells.map((row) => row[i]!.length)));
	return cells.map((row) =>
		row
			.map((cell, i) => cell.padEnd(widths[i]!))
			.join("  ")
			.trimEnd(),
	);
}
