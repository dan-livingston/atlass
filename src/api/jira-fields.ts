import type { Transport } from "#/api/client.ts";
import type { SiteField } from "#/api/jira-types.ts";

import { decodeEntities } from "#/util/html.ts";

interface FieldResponse {
	id: string;
	name: string;
	custom?: boolean;
	schema?: SiteField["schema"];
}

export async function listSiteFields(client: Transport): Promise<SiteField[]> {
	const fields = await client.getJson<FieldResponse[]>("/rest/api/3/field");
	return fields.map((f) => ({
		id: f.id,
		name: decodeEntities(f.name),
		custom: f.custom ?? false,
		schema: f.schema ?? null,
	}));
}
