import { expect, test } from "vite-plus/test";

import { AtlassianClient, pathAndQuery } from "#/api/client.ts";

test("pathAndQuery: reduces an absolute URL to what the client appends to its origin", () => {
	expect(pathAndQuery("https://api.bitbucket.org/2.0/repos?page=2")).toBe("/2.0/repos?page=2");
});

test("postMultipart: sends the file with its media type, extra fields, and the XSRF opt-out", async () => {
	const original = globalThis.fetch;
	let sent: { headers: Headers; form: FormData } | undefined;
	globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
		sent = { headers: new Headers(init?.headers), form: init?.body as FormData };
		return new Response("{}", { status: 200 });
	}) as typeof globalThis.fetch;
	try {
		const client = new AtlassianClient(
			{ site: "https://acme.atlassian.net", email: "a@b.c", token: "t" },
			"atlass auth login",
		);
		await client.postMultipart("/upload", "shot.png", new Uint8Array([1, 2]), {
			type: "image/png",
			fields: { comment: "from CI" },
		});
	} finally {
		globalThis.fetch = original;
	}

	const file = sent?.form.get("file") as File;
	expect(file.name).toBe("shot.png");
	expect(file.type).toBe("image/png");
	expect(file.size).toBe(2);
	expect(sent?.form.get("comment")).toBe("from CI");
	expect(sent?.headers.get("X-Atlassian-Token")).toBe("nocheck");
});
