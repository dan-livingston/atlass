import { Entry } from "@napi-rs/keyring";

const SERVICE = "atlass";

function entry(key: string): Entry {
	return new Entry(SERVICE, key);
}

function deleteEntryIfPresent(key: string): void {
	try {
		entry(key).deleteCredential();
	} catch {
		return;
	}
}

export function saveToken(email: string, token: string): void {
	entry(email).setPassword(token);
}

export function readToken(email: string): string | null {
	return entry(email).getPassword();
}

export function deleteToken(email: string): void {
	deleteEntryIfPresent(email);
}

function bitbucketKey(email: string): string {
	return `${email}:bitbucket`;
}

export function saveBitbucketToken(email: string, token: string): void {
	entry(bitbucketKey(email)).setPassword(token);
}

export function readBitbucketToken(email: string): string | null {
	return entry(bitbucketKey(email)).getPassword();
}

export function deleteBitbucketToken(email: string): void {
	deleteEntryIfPresent(bitbucketKey(email));
}
