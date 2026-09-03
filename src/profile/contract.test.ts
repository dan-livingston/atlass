import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import type { Profile } from "#/profile.ts";

import { diskProfile } from "#/profile/disk.ts";
import { memoryProfile } from "#/profile/memory.ts";

let dir: string;

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), "atlass-profile-"));
	process.env.XDG_CONFIG_HOME = dir;
});

afterAll(async () => {
	await rm(dir, { recursive: true, force: true });
});

const adapters: [string, () => Profile][] = [
	["disk", diskProfile],
	["memory", memoryProfile],
];

for (const [name, build] of adapters) {
	describe(name, () => {
		test("nothing has been written yet, so there is no config", async () => {
			expect(await build().read()).toBeNull();
		});

		test("a written config is read back whole", async () => {
			const profile = build();
			await profile.write({
				site: "https://acme.atlassian.net",
				email: "ada@acme.com",
				bitbucket: { workspace: "acme", defaultRepo: "api" },
			});

			expect(await profile.read()).toEqual({
				site: "https://acme.atlassian.net",
				email: "ada@acme.com",
				bitbucket: { workspace: "acme", defaultRepo: "api" },
			});
		});

		test("a write replaces the config rather than merging into it", async () => {
			const profile = build();
			await profile.write({ site: "https://acme.atlassian.net", email: "ada@acme.com" });
			await profile.write({ email: "ada@acme.com" });

			expect(await profile.read()).toEqual({ email: "ada@acme.com" });
		});

		test("clear leaves no config behind", async () => {
			const profile = build();
			await profile.write({ email: "ada@acme.com" });
			await profile.clear();

			expect(await profile.read()).toBeNull();
		});

		test("a config read back is not aliased to the stored one", async () => {
			const profile = build();
			await profile.write({ email: "ada@acme.com", bitbucket: { workspace: "acme" } });

			const first = await profile.read();
			first!.bitbucket!.workspace = "tampered";

			expect((await profile.read())?.bitbucket?.workspace).toBe("acme");
		});

		test("mutating the object that was written does not change what is stored", async () => {
			const profile = build();
			const config = { email: "ada@acme.com", bitbucket: { workspace: "acme" } };
			await profile.write(config);
			config.bitbucket.workspace = "tampered";

			expect((await profile.read())?.bitbucket?.workspace).toBe("acme");
		});

		test("clearing a config that was never written is not an error", async () => {
			const profile = build();
			await profile.clear();

			expect(await profile.read()).toBeNull();
		});
	});
}

describe("memory tokens", () => {
	test("a token is read back for the email and kind it was stored under", async () => {
		const profile = memoryProfile();
		await profile.setToken("ada@acme.com", "atlassian", "jira-token");
		await profile.setToken("ada@acme.com", "bitbucket", "bb-token");

		expect(await profile.token("ada@acme.com", "atlassian")).toBe("jira-token");
		expect(await profile.token("ada@acme.com", "bitbucket")).toBe("bb-token");
	});

	test("a token that was never stored reads as null", async () => {
		const profile = memoryProfile();

		expect(await profile.token("ada@acme.com", "atlassian")).toBeNull();
	});

	test("deleting one kind leaves the other in place", async () => {
		const profile = memoryProfile();
		await profile.setToken("ada@acme.com", "atlassian", "jira-token");
		await profile.setToken("ada@acme.com", "bitbucket", "bb-token");
		await profile.deleteToken("ada@acme.com", "atlassian");

		expect(await profile.token("ada@acme.com", "atlassian")).toBeNull();
		expect(await profile.token("ada@acme.com", "bitbucket")).toBe("bb-token");
	});

	test("deleting a token that is not there is not an error", async () => {
		const profile = memoryProfile();
		await profile.deleteToken("ada@acme.com", "atlassian");

		expect(await profile.token("ada@acme.com", "atlassian")).toBeNull();
	});

	test("a seeded profile answers without any writes", async () => {
		const profile = memoryProfile({
			config: { email: "ada@acme.com" },
			tokens: { "ada@acme.com:atlassian": "seeded" },
		});

		expect(await profile.read()).toEqual({ email: "ada@acme.com" });
		expect(await profile.token("ada@acme.com", "atlassian")).toBe("seeded");
	});
});
