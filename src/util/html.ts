// Jira and Confluence search return summaries/titles HTML-escaped. Decode the
// common named entities plus numeric ones so printed and JSON output is plain
// text.
const NAMED: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
};

export function decodeEntities(text: string): string {
	return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
		if (body[0] === "#") {
			const code =
				body[1] === "x" || body[1] === "X"
					? Number.parseInt(body.slice(2), 16)
					: Number.parseInt(body.slice(1), 10);
			// String.fromCodePoint throws RangeError outside 0..0x10FFFF; leave
			// out-of-range entities as-is rather than crash the whole result set.
			return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
				? String.fromCodePoint(code)
				: match;
		}
		const named = NAMED[body.toLowerCase()];
		return named ?? match;
	});
}
