import kleur from "kleur";

import { HttpError } from "#/api/http-error.ts";

export const PIPELINE_SCOPE = "read:pipeline:bitbucket";
export const PULL_REQUEST_SCOPE = "read:pullrequest:bitbucket";
export const ACCOUNT_SCOPE = "read:account";

const STATE_COLORS: Record<string, (text: string) => string> = {
	SUCCESSFUL: kleur.green,
	MERGED: kleur.green,
	APPROVED: kleur.green,
	FAILED: kleur.red,
	ERROR: kleur.red,
	DECLINED: kleur.red,
	CHANGES_REQUESTED: kleur.red,
	IN_PROGRESS: kleur.yellow,
	PENDING: kleur.yellow,
	OPEN: kleur.yellow,
	PAUSED: kleur.cyan,
	STOPPED: kleur.gray,
	SUPERSEDED: kleur.gray,
	DRAFT: kleur.gray,
};

export function colorForBitbucketState(state: string): (text: string) => string {
	return STATE_COLORS[state.toUpperCase()] ?? kleur.white;
}

export async function withScopeHint<T>(scope: string, fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
			throw new Error(
				`Bitbucket rejected the request (401/403). Check the token has the ${scope} ` +
					"scope, or run `atlass bitbucket login` to update it.",
			);
		}
		throw err;
	}
}
