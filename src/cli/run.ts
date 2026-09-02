const SIGINT_EXIT_CODE = 130;

export function run<A extends unknown[]>(
	fn: (...args: A) => Promise<void>,
): (...args: A) => Promise<void> {
	return async (...args: A) => {
		try {
			await fn(...args);
		} catch (err) {
			fail(err);
		}
	};
}

export function fail(err: unknown): never {
	if (isPromptInterrupt(err)) process.exit(SIGINT_EXIT_CODE);
	console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
}

function isPromptInterrupt(err: unknown): boolean {
	return err instanceof Error && err.name === "ExitPromptError";
}
