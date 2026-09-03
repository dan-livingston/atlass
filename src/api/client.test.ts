import { expect, test } from "vite-plus/test";

import { pathAndQuery } from "#/api/client.ts";

test("pathAndQuery: reduces an absolute URL to what the client appends to its origin", () => {
	expect(pathAndQuery("https://api.bitbucket.org/2.0/repos?page=2")).toBe("/2.0/repos?page=2");
});
