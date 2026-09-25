import type { Transport } from "#/api/client.ts";
import type { SprintState, SprintSummary } from "#/api/jira-types.ts";

import { SPRINT_STATES } from "#/api/jira-types.ts";
import { allOffsetPages, OFFSET_PAGE_SIZE } from "#/api/offset-pages.ts";

interface SprintResponse {
	id: number;
	state: SprintState;
	name: string;
	startDate?: string;
	endDate?: string;
	completeDate?: string;
	originBoardId?: number;
}

export async function listSprints(
	client: Transport,
	boardId: number,
	states: SprintState[],
): Promise<SprintSummary[]> {
	const state = states.join(",");
	const sprints = await allOffsetPages<SprintResponse>(
		client,
		(startAt) =>
			`/rest/agile/1.0/board/${boardId}/sprint?state=${state}&startAt=${startAt}&maxResults=${OFFSET_PAGE_SIZE}`,
	);
	return sprints.toSorted(byRelevance).map((s) => ({
		id: s.id,
		state: s.state,
		name: s.name,
		start: s.startDate ?? null,
		end: s.endDate ?? null,
		boardId: s.originBoardId ?? boardId,
	}));
}

function byRelevance(a: SprintResponse, b: SprintResponse): number {
	const rank = SPRINT_STATES.indexOf(a.state) - SPRINT_STATES.indexOf(b.state);
	if (rank !== 0 || a.state !== "closed") return rank;
	return finishedAt(b) - finishedAt(a);
}

function finishedAt(sprint: SprintResponse): number {
	return Date.parse(sprint.completeDate ?? sprint.endDate ?? "") || 0;
}
