import { defineConfig } from "vite-plus";

export default defineConfig({
	staged: {
		"*": "vp check --fix",
	},
	pack: {
		entry: ["src/cli.ts", "src/jira.ts", "src/confluence.ts", "src/bitbucket.ts"],
		exports: {
			bin: {
				atlass: "./src/cli.ts",
				bitbucket: "./src/bitbucket.ts",
				confluence: "./src/confluence.ts",
				jira: "./src/jira.ts",
			},
		},
	},
	lint: {
		options: {
			typeAware: true,
			typeCheck: true,
		},
		jsPlugins: ["./lint/no-comments.ts"],
		rules: {
			"atlass/no-comments": "error",
			"max-lines": ["error", { max: 250, skipBlankLines: false, skipComments: false }],
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["./*", "../*"],
							message: "Use #/ subpath imports instead of relative paths.",
						},
						{
							group: ["#/test/*"],
							message: "#/test holds test-only helpers; import it from a test file.",
						},
						{
							group: ["node:fs", "node:fs/promises", "node:os", "@napi-rs/keyring"],
							message:
								"Real IO lives behind a port. Use env.files or env.profile; only their disk adapters may import this.",
						},
						{
							group: ["#/files/disk.ts", "#/profile/disk.ts", "#/terminal/tty.ts"],
							message:
								"Real adapters are wired at the composition root. Take the port off Env instead.",
						},
					],
				},
			],
		},
		overrides: [
			{
				files: ["*.test.ts", "src/test/*.ts"],
				rules: {
					"max-lines": [
						"error",
						{ max: 400, skipBlankLines: false, skipComments: false },
					],
					"no-restricted-imports": [
						"error",
						{
							patterns: [
								{
									group: ["./*", "../*"],
									message: "Use #/ subpath imports instead of relative paths.",
								},
								{
									group: [
										"node:fs",
										"node:fs/promises",
										"node:os",
										"@napi-rs/keyring",
									],
									message:
										"Tests must not touch the real disk or keyring. Seed env.files or env.profile instead.",
								},
								{
									group: [
										"#/files/disk.ts",
										"#/profile/disk.ts",
										"#/terminal/tty.ts",
									],
									message:
										"Tests must not build real adapters. Use the fakes in #/test/env.ts.",
								},
							],
						},
					],
				},
			},
			{
				files: ["src/cli/run.ts", "src/terminal/open.ts", "src/terminal/tty.test.ts"],
				rules: {
					"no-restricted-imports": [
						"error",
						{
							patterns: [
								{
									group: ["./*", "../*"],
									message: "Use #/ subpath imports instead of relative paths.",
								},
								{
									group: [
										"node:fs",
										"node:fs/promises",
										"node:os",
										"@napi-rs/keyring",
									],
									message:
										"Real IO lives behind a port. Use env.files or env.profile; only their disk adapters may import this.",
								},
							],
						},
					],
				},
			},
			{
				files: ["src/files/disk.ts", "src/profile/disk.ts"],
				rules: {
					"no-restricted-imports": [
						"error",
						{
							patterns: [
								{
									group: ["./*", "../*"],
									message: "Use #/ subpath imports instead of relative paths.",
								},
								{
									group: [
										"#/files/disk.ts",
										"#/profile/disk.ts",
										"#/terminal/tty.ts",
									],
									message: "An adapter does not reach for another adapter.",
								},
							],
						},
					],
				},
			},
			{
				files: ["src/files/contract.test.ts", "src/profile/contract.test.ts"],
				rules: {
					"no-restricted-imports": [
						"error",
						{
							patterns: [
								{
									group: ["./*", "../*"],
									message: "Use #/ subpath imports instead of relative paths.",
								},
							],
						},
					],
				},
			},
		],
	},
	fmt: {
		tabWidth: 4,
		useTabs: true,
		trailingComma: "all",
		sortImports: {
			groups: [
				"type-import",
				["value-builtin", "value-external"],
				"type-internal",
				"value-internal",
				["type-parent", "type-sibling", "type-index"],
				["value-parent", "value-sibling", "value-index"],
				"unknown",
			],
		},
	},
	test: {
		include: ["src/**/*.test.ts"],
		env: { TZ: "Australia/Brisbane" },
	},
});
