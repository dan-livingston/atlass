import type { BoardSummary } from "#/api/jira-types.ts";
import type { SessionEnv } from "#/env.ts";

import { listBoards } from "#/api/jira-boards.ts";

export interface BoardsOptions {
	project?: string;
	json?: boolean;
}

export async function jiraBoards(
	{ session, term }: SessionEnv,
	query: string | undefined,
	options: BoardsOptions,
): Promise<void> {
	const boards = filterBoards(await listBoards(session, session.site), query, options.project);

	if (options.json) term.json(boards);
	else if (boards.length === 0) term.out("No matching boards.");
	else term.out(formatBoardRows(boards));
}

function filterBoards(
	boards: BoardSummary[],
	query: string | undefined,
	project: string | undefined,
): BoardSummary[] {
	const needle = query?.toLowerCase();
	const key = project?.toUpperCase();
	return boards.filter(
		(b) =>
			(!needle || b.name.toLowerCase().includes(needle)) &&
			(!key || b.project?.toUpperCase() === key),
	);
}

function formatBoardRows(boards: BoardSummary[]): string[] {
	const width = (pick: (b: BoardSummary) => string) =>
		Math.max(...boards.map((b) => pick(b).length));
	const idWidth = width((b) => String(b.id));
	const typeWidth = width((b) => b.type);
	const nameWidth = width((b) => b.name);
	return boards.map((b) =>
		`${String(b.id).padEnd(idWidth)}  ${b.type.padEnd(typeWidth)}  ${b.name.padEnd(nameWidth)}  ${b.project ?? ""}`.trimEnd(),
	);
}
