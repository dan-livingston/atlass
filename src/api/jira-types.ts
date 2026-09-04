import type { AdfNode } from "#/adf/types.ts";
import type { RemoteAttachment } from "#/api/attachments.ts";

export interface JiraComment {
	author: string;
	created: string;
	body: AdfNode | null;
}

export interface JiraIssue {
	key: string;
	url: string;
	summary: string;
	type: string;
	status: string;
	statusCategory: string;
	assignee: string;
	reporter: string;
	priority: string;
	labels: string[];
	created: string;
	updated: string;
	description: AdfNode | null;
	comments: JiraComment[];
	attachments: RemoteAttachment[];
}

export interface IssueUpdate {
	description: AdfNode;
	summary?: string;
}

export interface IssueSummary {
	key: string;
	status: string;
	statusCategory: string;
	summary: string;
	updated: string;
	url: string;
}

export interface IssueSearchParams {
	text?: string;
	project?: string[];
	assignee?: string[];
	reporter?: string[];
	status?: string[];
	type?: string[];
	label?: string[];
	updatedSince?: string;
	open?: boolean;
	limit: number;
}

export interface IssueListParams {
	all?: boolean;
	project?: string;
}

export interface IssueList {
	issues: IssueSummary[];
	truncated: boolean;
}

export interface ProjectSummary {
	key: string;
	name: string;
	id: string;
	type: string;
	url: string;
}

export interface StatusSummary {
	name: string;
	id: string;
	category: string;
	categoryKey: string;
}

export interface CreateIssueType {
	id: string;
	name: string;
	description: string;
	subtask: boolean;
}

export interface AllowedValue {
	id?: string;
	name?: string;
	value?: string;
	key?: string;
	children?: AllowedValue[];
}

export interface FieldSchema {
	type: string;
	items?: string;
	system?: string;
	custom?: string;
}

export interface CreateField {
	fieldId: string;
	name: string;
	required: boolean;
	hasDefaultValue: boolean;
	defaultValue?: unknown;
	schema: FieldSchema;
	allowedValues?: AllowedValue[];
}

export interface CreatedIssue {
	id: string;
	key: string;
	url: string;
}

export interface JiraUser {
	accountId: string;
	displayName: string;
	email: string;
	active: boolean;
}
