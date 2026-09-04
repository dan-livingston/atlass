import kleur from "kleur";

import type { PullRequestComment, PullRequestParticipant } from "#/api/bitbucket-pr-detail.ts";
import type { RenderedThread } from "#/commands/view.ts";

import { formatDateTime } from "#/util/format.ts";

const MENTION = /@\{([^}]+)\}/g;

export function renderedPrComments(
	comments: PullRequestComment[],
	participants: PullRequestParticipant[],
): RenderedThread[] {
	const names = new Map(participants.map((person) => [person.accountId, person.name]));
	return threadsOf(comments).map((thread) => renderThread(thread, names));
}

export function threadsOf(comments: PullRequestComment[]): PullRequestComment[][] {
	const byId = new Map(comments.map((comment) => [comment.id, comment]));
	const threads = new Map<number, PullRequestComment[]>();
	for (const comment of comments) {
		const root = rootOf(comment, byId);
		const thread = threads.get(root.id);
		if (thread) thread.push(comment);
		else threads.set(root.id, [comment]);
	}
	return [...threads.values()];
}

function rootOf(
	comment: PullRequestComment,
	byId: Map<number, PullRequestComment>,
): PullRequestComment {
	const seen = new Set([comment.id]);
	let current = comment;
	while (current.parentId !== null) {
		const parent = byId.get(current.parentId);
		if (!parent || seen.has(parent.id)) break;
		seen.add(parent.id);
		current = parent;
	}
	return current;
}

function renderThread(thread: PullRequestComment[], names: Map<string, string>): RenderedThread {
	const rows: RenderedThread = thread.map((comment, index) => ({
		author: comment.author,
		created: comment.created,
		markdown: resolveMentions(comment.body, names),
		...(index === 0 ? { anchor: comment.anchor } : {}),
	}));
	const trailer = resolvedTrailer(thread);
	const last = rows.at(-1);
	if (trailer && last) last.trailer = trailer;
	return rows;
}

function resolvedTrailer(thread: PullRequestComment[]): string {
	const resolved = thread.find((comment) => comment.resolved)?.resolved;
	if (!resolved) return "";
	const by = resolved.by ? ` by ${resolved.by}` : "";
	return kleur.green(`  ↳ resolved${by} · ${formatDateTime(resolved.at)}`);
}

export function resolveMentions(body: string, names: Map<string, string>): string {
	return body.replace(MENTION, (raw, id: string) => {
		const name = names.get(id);
		return name ? `@${name}` : raw;
	});
}
