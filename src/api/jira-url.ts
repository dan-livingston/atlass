export function browseUrl(site: string, key: string): string {
	return `${site}/browse/${key}`;
}

export function boardUrl(site: string, id: number): string {
	return `${site}/secure/RapidBoard.jspa?rapidView=${id}`;
}
