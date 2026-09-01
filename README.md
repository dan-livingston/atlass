# atlass

CLI for Atlassian Cloud. Copies Jira issues and Confluence pages to Markdown,
pushes edits back, searches both, and shows Bitbucket pipeline runs.

## Install

```bash
npm install -g atlass
```

Or from source: `pnpm install && pnpm build && pnpm link --global`.

## Authentication

Create an API token at
`https://id.atlassian.com/manage-profile/security/api-tokens`, then:

```bash
atlass auth login    # prompts for site, email, and token
atlass auth status
atlass auth logout
```

Site and email go in `~/.config/atlass/config.json`. The token goes in the OS
keyring. One account at a time.

Bitbucket needs its own Bitbucket-scoped token with pipeline and workspace read
scopes, since Atlassian tokens are scoped per product:

```bash
atlass bitbucket login    # prompts for workspace, default repo, and token
atlass bitbucket status
atlass bitbucket logout
```

## Copy

```bash
atlass jira copy PROJ-123
atlass jira copy https://acme.atlassian.net/browse/PROJ-123
atlass confluence copy 123456
atlass confluence copy https://acme.atlassian.net/wiki/spaces/DEV/pages/123456/Title
```

Writes `PROJ-123.md` or `123456-title-slug.md` to the current directory, with
attachments in a sibling `<name>.assets/` folder. Pass `--out` with a directory
or file path to write elsewhere. Existing files are overwritten.

Each file has YAML frontmatter, an H1, the body as Markdown, a `## Comments`
section, and an `## Attachments` section. Inline images link to the local copy
when they can be matched to an attachment.

## Update

Edit a copied file, then push it back:

```bash
atlass jira update PROJ-123.md
atlass jira update PROJ-123.md --summary       # also push the H1 as the summary
atlass confluence update 123456-title-slug.md
atlass confluence update file.md --title      # also push the H1 as the title
atlass confluence update file.md -m "fix typo"
```

Both accept `--dry-run` to preview and `--force` to skip the checks below. The
body sent is everything between the H1 and `## Comments`.

- The update aborts if the issue or page changed on the server since the copy.
- Panels, macros, expands, and layouts were flattened on copy and cannot be
  rebuilt. If the live content still has them, the update asks before
  overwriting.
- Confluence uploads local images referenced in the body as attachments. Jira
  update does not support image changes yet.

## Search

```bash
atlass jira search "safari login"
atlass jira search --project PROJ --assignee me --status "In Progress"
atlass jira search --jql "project = PROJ AND labels = regression"
atlass confluence search "onboarding" --space DOCS
atlass confluence search --cql "label = runbook ORDER BY created DESC"
```

Filters combine with AND and sort by most recently updated. `--jql` and `--cql`
replace the friendly filters. `--limit` defaults to 25, max 100. `--json` prints
machine output. Add `--copy` to pick results interactively and copy each one,
with `--out` as the target directory.

Discovery aids for the filters:

```bash
atlass jira projects [query]
atlass jira statuses [query] [--project PROJ]
```

## Bitbucket pipelines

```bash
atlass bitbucket pipelines                    # recent runs for the default repo
atlass bitbucket pipelines --repo acme/web
atlass bitbucket pipeline 124                 # one run and its steps
```

`--repo` takes `workspace/slug` or a bare slug under the configured workspace.
`--limit` and `--json` work as for search.

## Development

```bash
pnpm test      # unit tests
pnpm check     # format, lint, typecheck (--fix to auto-fix)
pnpm build     # build dist/cli.mjs
pnpm dev       # build in watch mode
```

Commands live in `src/commands/`, API clients in `src/api/`, and the ADF
converters in `src/adf/`.
