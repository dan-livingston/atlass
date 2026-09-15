import { structuredPatch } from "diff";
import kleur from "kleur";

const CONTEXT_LINES = 3;

export function unifiedDiff(before: string, after: string, labels: [string, string]): string[] {
	if (before === after) return [];
	const [from, to] = labels;
	const patch = structuredPatch(from, to, `${before}\n`, `${after}\n`, undefined, undefined, {
		context: CONTEXT_LINES,
	});
	return [
		`--- ${from}`,
		`+++ ${to}`,
		...patch.hunks.flatMap((h) => [
			`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
			...h.lines,
		]),
	];
}

export function colorDiffLine(line: string): string {
	if (line.startsWith("+++") || line.startsWith("---")) return kleur.bold(line);
	if (line.startsWith("@@")) return kleur.cyan(line);
	if (line.startsWith("+")) return kleur.green(line);
	if (line.startsWith("-")) return kleur.red(line);
	return line;
}
