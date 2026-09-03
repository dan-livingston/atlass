import type { AtlassianClient } from "#/api/client.ts";
import type { AllowedValue, CreateField, CreatedIssue, CreateIssueType } from "#/api/jira-types.ts";

import { HttpError } from "#/api/client.ts";
import { browseUrl } from "#/api/jira-url.ts";
import { decodeEntities } from "#/util/html.ts";

interface CreateMetaPage {
	total?: number;
}

interface IssueTypesPage extends CreateMetaPage {
	issueTypes?: CreateIssueType[];
}

interface FieldsPage extends CreateMetaPage {
	fields?: CreateField[];
}

const CREATEMETA_PAGE_SIZE = 200;

export async function fetchCreateIssueTypes(
	client: AtlassianClient,
	project: string,
): Promise<CreateIssueType[]> {
	const types = await pageCreateMeta(
		client,
		project,
		"",
		(page: IssueTypesPage) => page.issueTypes ?? [],
	);
	return types.map((t) => ({
		id: t.id,
		name: t.name,
		description: t.description ?? "",
		subtask: t.subtask ?? false,
	}));
}

export async function fetchCreateFields(
	client: AtlassianClient,
	project: string,
	issueTypeId: string,
): Promise<CreateField[]> {
	const fields = await pageCreateMeta(
		client,
		project,
		`/${encodeURIComponent(issueTypeId)}`,
		(page: FieldsPage) => page.fields ?? [],
	);
	return fields.map((f) => ({
		...f,
		name: decodeEntities(f.name),
		allowedValues: f.allowedValues?.map(decodeAllowedValue),
	}));
}

function decodeAllowedValue(v: AllowedValue): AllowedValue {
	return {
		...v,
		name: v.name === undefined ? undefined : decodeEntities(v.name),
		value: v.value === undefined ? undefined : decodeEntities(v.value),
		children: v.children?.map(decodeAllowedValue),
	};
}

async function pageCreateMeta<P extends CreateMetaPage, T>(
	client: AtlassianClient,
	project: string,
	suffix: string,
	items: (page: P) => T[],
): Promise<T[]> {
	const base = `/rest/api/3/issue/createmeta/${encodeURIComponent(project)}/issuetypes${suffix}`;
	const all: T[] = [];
	for (let startAt = 0; ;) {
		let page: P;
		try {
			page = await client.getJson<P>(
				`${base}?startAt=${startAt}&maxResults=${CREATEMETA_PAGE_SIZE}`,
			);
		} catch (err) {
			if (err instanceof HttpError && err.status === 404) {
				throw new Error(`No project found with key "${project}".`);
			}
			throw err;
		}
		const values = items(page);
		all.push(...values);
		startAt += values.length;
		if (values.length === 0 || startAt >= (page.total ?? 0)) return all;
	}
}

export async function createIssue(
	client: AtlassianClient,
	site: string,
	fields: Record<string, unknown>,
): Promise<CreatedIssue> {
	const res = await client.postJson<{ id: string; key: string }>(
		"/rest/api/3/issue?updateHistory=true",
		{ fields },
	);
	return { id: res.id, key: res.key, url: browseUrl(site, res.key) };
}
