import type { Command } from "commander";

import { run } from "#/cli/run.ts";
import {
	bitbucketLogin,
	bitbucketLogout,
	bitbucketPipeline,
	bitbucketPipelines,
	bitbucketStatus,
} from "#/commands/bitbucket.ts";

export function registerBitbucket(bitbucket: Command): Command {
	bitbucket.description("Bitbucket commands");
	bitbucket
		.command("login")
		.description("Store Bitbucket workspace and API token")
		.action(run(bitbucketLogin));
	bitbucket
		.command("logout")
		.description("Remove stored Bitbucket credentials")
		.action(run(bitbucketLogout));
	bitbucket
		.command("status")
		.description("Show the current Bitbucket login")
		.action(run(bitbucketStatus));
	bitbucket
		.command("pipelines")
		.description("List recent pipeline runs for a repo")
		.option("-r, --repo <repo>", "workspace/slug, or a bare slug (defaults to config)")
		.option("-l, --limit <n>", "max results (default 25, max 100)")
		.option("--json", "output results as JSON")
		.action(run(bitbucketPipelines));
	bitbucket
		.command("pipeline <number>")
		.description("Show one pipeline run and its steps")
		.option("-r, --repo <repo>", "workspace/slug, or a bare slug (defaults to config)")
		.action(run(bitbucketPipeline));
	return bitbucket;
}
