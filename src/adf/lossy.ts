import type { AdfNode } from "./types.ts";

const LOSSY_LABELS: Record<string, string> = {
	panel: "panel",
	expand: "expand",
	nestedExpand: "expand",
	decisionList: "decision list",
	layoutSection: "layout",
	extension: "macro",
	bodiedExtension: "macro",
	inlineExtension: "macro",
};

export const JIRA_LOSSY_LABELS: Record<string, string> = {
	...LOSSY_LABELS,
	media: "image",
	mediaInline: "image",
};

export function findLossyNodes(
	node: AdfNode | null | undefined,
	lossyLabels: Record<string, string> = LOSSY_LABELS,
): Map<string, number> {
	const counts = new Map<string, number>();
	const visit = (n: AdfNode): void => {
		const label = lossyLabels[n.type];
		if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
		for (const child of n.content ?? []) visit(child);
	};
	if (node) visit(node);
	return counts;
}

export function formatLossy(counts: Map<string, number>): string {
	return [...counts.entries()]
		.map(([label, n]) => `${n} ${label}${n === 1 ? "" : "s"}`)
		.join(", ");
}
