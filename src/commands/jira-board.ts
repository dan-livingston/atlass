import type { BoardDetail } from "#/api/jira-types.ts";
import type { SessionEnv } from "#/env.ts";

import { fetchBoard } from "#/api/jira-board.ts";
import { withBoard } from "#/commands/board-ref.ts";
import { fieldLines } from "#/commands/view.ts";

export interface BoardOptions {
	json?: boolean;
}

export async function jiraBoard(
	{ session, term }: SessionEnv,
	ref: string,
	options: BoardOptions,
): Promise<void> {
	const board = await withBoard(session, ref, (id) => fetchBoard(session, session.site, id));

	if (options.json) term.json(board);
	else term.out(formatBoard(board));
}

function formatBoard(board: BoardDetail): string[] {
	return [
		board.name,
		...fieldLines([
			["ID", String(board.id)],
			["Type", board.type],
			["Estimation", estimationLine(board)],
			["Filter", board.filter.jql ?? `not visible to you (filter ${board.filter.id})`],
			["Sub-filter", board.filter.subQuery ?? ""],
			["URL", board.url],
		]),
		"",
		...columnLines(board),
	];
}

function estimationLine({ estimation }: BoardDetail): string {
	return estimation
		? `${estimation.fieldName} (${estimation.fieldId})`
		: "none, this board does not estimate with a field";
}

function columnLines({ columns }: BoardDetail): string[] {
	const statuses = columns.flatMap((c) => c.statuses);
	const width = Math.max(0, ...statuses.map((s) => s.name.length));
	return columns.flatMap((c) => [
		c.name,
		...c.statuses.map((s) => `  ${s.name.padEnd(width)}  ${s.category}`.trimEnd()),
	]);
}
