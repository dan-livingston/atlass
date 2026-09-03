import type { Command } from "commander";

import { bareAction, bitbucketAction } from "#/cli/run.ts";
import { bitbucketPrs } from "#/commands/bitbucket-prs.ts";
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
		.action(bareAction(bitbucketLogin));
	bitbucket
		.command("logout")
		.description("Remove stored Bitbucket credentials")
		.action(bareAction(bitbucketLogout));
	bitbucket
		.command("status")
		.description("Show the current Bitbucket login")
		.action(bareAction(bitbucketStatus));
	bitbucket
		.command("pipelines")
		.description("List recent pipeline runs for a repo")
		.option("-r, --repo <repo>", "workspace/slug, or a bare slug (defaults to config)")
		.option("-l, --limit <n>", "max results (default 25, max 100)")
		.option("--json", "output results as JSON")
		.action(bitbucketAction(bitbucketPipelines));
	bitbucket
		.command("prs")
		.description("List pull requests for a repo")
		.option("-r, --repo <repo>", "workspace/slug, or a bare slug (defaults to config)")
		.option("-s, --state <state...>", "open, merged, declined, or superseded")
		.option("--all", "include every state")
		.option("-a, --author <who>", "limit to an author ('me', an account id, or a uuid)")
		.option("--reviewer <who>", "limit to a reviewer ('me', an account id, or a uuid)")
		.option(
			"-q, --query <bbql>",
			"raw Bitbucket query (not for use with --author or --reviewer)",
		)
		.option("-l, --limit <n>", "max results (default 25, max 100)")
		.option("--json", "output results as JSON")
		.action(bitbucketAction(bitbucketPrs));
	bitbucket
		.command("pipeline <number>")
		.description("Show one pipeline run and its steps")
		.option("-r, --repo <repo>", "workspace/slug, or a bare slug (defaults to config)")
		.action(bitbucketAction(bitbucketPipeline));
	return bitbucket;
}
