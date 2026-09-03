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
	},
});
