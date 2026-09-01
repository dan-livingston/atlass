import { definePlugin } from "@oxlint/plugins";

export default definePlugin({
	meta: { name: "atlass" },
	rules: {
		"no-comments": {
			meta: {
				messages: {
					comment: "Comments are not allowed. Restructure the code until it needs none.",
				},
			},
			create(context) {
				return {
					Program() {
						for (const comment of context.sourceCode.getAllComments()) {
							if (comment.type === "Shebang") continue;
							context.report({ messageId: "comment", loc: comment.loc });
						}
					},
				};
			},
		},
	},
});
