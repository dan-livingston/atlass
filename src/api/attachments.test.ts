import { expect, test } from "vite-plus/test";

import type { DownloadedAttachment } from "./attachments.ts";

import { mediaResolver } from "./attachments.ts";

test("mediaResolver matches by id, then by alt filename since jira media nodes often carry only that", () => {
	const downloaded: DownloadedAttachment[] = [
		{ mediaId: "file-1", filename: "shot.png", url: "", relativePath: "x.assets/shot.png" },
	];
	const resolve = mediaResolver(downloaded);
	expect(resolve({ id: "file-1" })).toBe("x.assets/shot.png");
	expect(resolve({ alt: "shot.png" })).toBe("x.assets/shot.png");
	expect(resolve({ id: "unknown" })).toBeUndefined();
});
