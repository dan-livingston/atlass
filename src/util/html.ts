const MAX_CODE_POINT = 0x10ffff;

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
			return isCodePoint(code) ? String.fromCodePoint(code) : match;
		}
		const named = NAMED[body.toLowerCase()];
		return named ?? match;
	});
}

function isCodePoint(code: number): boolean {
	return Number.isFinite(code) && code >= 0 && code <= MAX_CODE_POINT;
}
