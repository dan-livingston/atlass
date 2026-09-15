import { basename, isAbsolute, resolve } from "node:path";

import type { PageVersion } from "#/api/confluence-pages.ts";
import type { SessionEnv } from "#/env.ts";
import type { Files } from "#/files.ts";
import type { LocalImage } from "#/update/plan-page.ts";
import type { UpdatePlan } from "#/update/plan.ts";

import { imageHrefs } from "#/adf/from-markdown.ts";
import { uploadAttachment } from "#/api/confluence-attachments.ts";
import { updatePage } from "#/api/confluence-pages.ts";
import { withUploadedIds } from "#/update/plan-page.ts";
import { isExternalHref } from "#/util/parse.ts";

export interface PagePush {
	id: string;
	nextVersion: number;
	message: string;
}

export async function pushPage(
	{ session, term, files }: SessionEnv,
	plan: UpdatePlan,
	push: PagePush,
): Promise<PageVersion> {
	const ids = new Map<string, string>();
	for (const upload of plan.uploads) {
		term.err(`Uploading ${upload.filename} ...`);
		const bytes = await files.readBytes(upload.path);
		ids.set(upload.href, await uploadAttachment(session, push.id, upload.filename, bytes));
	}
	return updatePage(session, push.id, {
		title: plan.headline.next,
		nextVersion: push.nextVersion,
		body: withUploadedIds(plan.body, ids),
		message: push.message,
	});
}

export async function statLocalImages(
	files: Files,
	dir: string,
	md: string,
): Promise<LocalImage[]> {
	const hrefs = imageHrefs(md).filter((href) => !isExternalHref(href));
	return Promise.all(
		hrefs.map(async (href) => {
			const path = isAbsolute(href) ? href : resolve(dir, href);
			return { href, path, filename: basename(path), ...(await fileSize(files, path)) };
		}),
	);
}

async function fileSize(files: Files, path: string): Promise<{ size?: number }> {
	try {
		return { size: await files.size(path) };
	} catch {
		return {};
	}
}
