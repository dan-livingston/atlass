import { expect, test } from "vite-plus/test";

import type { DownloadedAttachment } from "../api/attachments.ts";

import {
	attachmentsSection,
	commentsSection,
	frontmatter,
	joinSections,
	mediaResolver,
} from "./document.ts";

test("frontmatter quotes strings and lists arrays", () => {
	const fm = frontmatter({ key: "PROJ-1", labels: ["a", "b"], version: 3 });
	expect(fm).toBe(
		["---", 'key: "PROJ-1"', "labels:", '  - "a"', '  - "b"', "version: 3", "---"].join("\n"),
	);
});

test("frontmatter escapes quotes", () => {
	expect(frontmatter({ title: 'a "quoted" title' })).toContain('title: "a \\"quoted\\" title"');
});

test("frontmatter renders empty array inline", () => {
	expect(frontmatter({ labels: [] })).toContain("labels: []");
});

test("mediaResolver matches by id then by alt filename", () => {
	const downloaded: DownloadedAttachment[] = [
		{ id: "file-1", filename: "shot.png", url: "", relativePath: "x.assets/shot.png" },
	];
	const resolve = mediaResolver(downloaded);
	expect(resolve({ id: "file-1" })).toBe("x.assets/shot.png");
	expect(resolve({ alt: "shot.png" })).toBe("x.assets/shot.png");
	expect(resolve({ id: "unknown" })).toBeUndefined();
});

test("attachmentsSection lists downloaded files", () => {
	const downloaded: DownloadedAttachment[] = [
		{ id: "1", filename: "a.png", url: "", relativePath: "x.assets/a.png" },
	];
	expect(attachmentsSection(downloaded)).toBe("## Attachments\n\n- [a.png](x.assets/a.png)");
	expect(attachmentsSection([])).toBe("");
});

test("commentsSection renders author, date, and body", () => {
	const section = commentsSection(
		[
			{
				author: "Dan",
				created: "2025-07-01T10:30:00.000Z",
				body: {
					type: "doc",
					content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
				},
			},
		],
		() => undefined,
	);
	expect(section).toBe("## Comments\n\n### Dan - 2025-07-01 10:30\n\nhi");
	expect(commentsSection([], () => undefined)).toBe("");
});

test("joinSections drops empties and ends with newline", () => {
	expect(joinSections(["a", "", "b"])).toBe("a\n\nb\n");
});
