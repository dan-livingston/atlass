export interface StubbedRequest {
	url: string;
	method: string;
	authorization: string | null;
}

export type Route = (() => Response) | object;

export interface FetchStub {
	requests: StubbedRequest[];
	restore(): void;
}

export function stubFetch(routes: Record<string, Route>): FetchStub {
	const original = globalThis.fetch;
	const requests: StubbedRequest[] = [];

	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = input instanceof Request ? input.url : input.toString();
		const headers = new Headers(init?.headers);
		requests.push({
			url,
			method: init?.method ?? "GET",
			authorization: headers.get("authorization"),
		});
		const route = routes[url];
		if (route === undefined) return new Response("no route", { status: 404 });
		if (typeof route === "function") return (route as () => Response)();
		return new Response(JSON.stringify(route), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	}) as typeof globalThis.fetch;

	return {
		requests,
		restore(): void {
			globalThis.fetch = original;
		},
	};
}
