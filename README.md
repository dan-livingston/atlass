# atlass

CLI for Atlassian Cloud. Views Jira issues in the terminal, copies Jira issues
and Confluence pages to Markdown, pushes edits back, searches both, and shows
Bitbucket pipeline runs and pull requests.

## Install

```bash
npm install -g atlass
```

Or from source: `pnpm install && pnpm build && pnpm link --global`.

The install also adds `jira`, `confluence`, and `bitbucket` as shortcuts for
`atlass jira`, `atlass confluence`, and `atlass bitbucket`. Under `atlass`,
`conf` and `bb` are aliases for the two long names.

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

Bitbucket needs its own Bitbucket-scoped token with pipeline, pull request,
repository, account, and workspace read scopes, since Atlassian tokens are
scoped per product:

```bash
atlass bitbucket login    # prompts for workspace, default repo, and token
atlass bitbucket status
atlass bitbucket logout
```

## View

```bash
atlass jira view PROJ-123
atlass jira view https://acme.atlassian.net/browse/PROJ-123
atlass confluence view 123456
atlass confluence view https://acme.atlassian.net/wiki/spaces/DEV/pages/123456/Title
```

Prints the issue or page to the terminal: fields, the body, the last five
comments (`--all-comments` for all of them), and attachment names. The Jira
status is colored by category and the Markdown is syntax highlighted, code
blocks included; color turns off automatically when piping, or with `NO_COLOR`,
leaving plain Markdown.

Output taller than the terminal goes through a pager, `$PAGER` or `less`, with
`LESS=FRX` unless you have set `LESS` yourself. Pass `--no-pager` to print
directly. Piped output is never paged.

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

## Create

```bash
atlass jira create                              # prompts for everything
atlass jira create BSC Bug --summary "Login loops" --priority High --label auth
atlass jira create BSC Task -s "Rotate keys" --description-file notes.md --assignee me
atlass jira create BSC Defect -s "..." --component API --field severity=S2 --dry-run
atlass jira fields BSC                          # issue types you can create
atlass jira fields BSC Defect                   # the create form for one type
```

With no field flags on a terminal, `create` walks through the create screen:
required fields, a pick list of optional ones, then a review and confirm.
Multi-line fields open `$EDITOR` for Markdown.

Any field flag, `--no-input`, or a non-terminal switches to strict mode:
nothing is prompted, and the command fails before creating anything if a
required field is missing, a value is not allowed, or a field is not on the
create screen. `--field NAME=VALUE` takes the display name or id. Multi-value
fields take commas or repeated flags; cascading selects take `Parent > Child`;
assignees take `me`, an account id, or a name matching one assignable user.

`--dry-run` prints the resolved payload. `--json` prints the created key, id,
and URL. `jira fields` shows what each field expects.

## List

```bash
atlass jira list
atlass jira list --project PROJ
atlass jira list --all
atlass confluence list
atlass confluence list --space DOCS
```

`jira list` shows issues assigned to you as `KEY  Status  Age  Summary`, with
In Progress first, then To Do, and the most recently updated at the top of each
group. Done issues are left out; `--all` adds those updated in the last 30 days.

`confluence list` shows the pages you starred as `ID  SPACE  Age  Title`, most
recently updated first. `--limit` works as for search.

For both, `--json` and `--copy` work as for search.

## Search

```bash
atlass jira search "safari login"
atlass jira search --project PROJ --assignee me --status "In Progress"
atlass jira search --jql "project = PROJ AND labels = regression"
atlass confluence search "onboarding" --space DOCS
atlass confluence search --cql "label = runbook ORDER BY created DESC"
```

Filters combine with AND and sort by most recently updated. Rows use the same
columns as `jira list` and `confluence list`. `--jql` and `--cql` replace the
friendly filters. `--limit` defaults to 25, max 100. `--json` prints machine
output. Add `--copy` to pick results interactively and copy each one, with
`--out` as the target directory.

Discovery aids for the filters:

```bash
atlass jira projects [query]
atlass jira statuses [query] [--project PROJ]
```

## Bitbucket

`--repo` takes `workspace/slug` or a bare slug under the configured workspace,
and defaults to the repo set at login. `--limit` and `--json` work as for
search.

### Pipelines

```bash
atlass bitbucket pipelines                    # recent runs for the default repo
atlass bitbucket pipelines --repo acme/web
atlass bitbucket pipeline 124                 # one run and its steps
```

`pipelines` shows runs as `#NUM  Status  Age  ref (commit) · duration`, newest
first. `pipeline` adds the trigger, the creator, and the steps.

### Pull requests

```bash
atlass bitbucket prs                          # open PRs on the default repo
atlass bitbucket prs --state merged --limit 10
atlass bitbucket prs --all                    # every state
atlass bitbucket prs --reviewer me            # waiting on your review
atlass bitbucket prs --author me --repo acme/web
atlass bitbucket prs --query 'destination.branch.name = "main"'
atlass bitbucket pr 842                       # one pull request in full
atlass bitbucket pr https://bitbucket.org/acme/web/pull-requests/842
```

`prs` shows `#ID  State  Age  Title`, most recently updated first, open only
unless `--state` or `--all` says otherwise. Drafts show as `DRAFT` in place of
`OPEN`.

`--author` and `--reviewer` combine with OR, so passing both lists everything
involving that person. `--query` replaces them and cannot be used alongside
them, and it cannot mention `state`, which `--state` owns.

`pr` shows one pull request: state, branches, approvals, the description, each
reviewer and where they stand, the changed files with line counts, and the last
five comment threads, inline ones anchored to `file:line`. A thread prints as its
opening comment with every reply indented beneath it, a resolved one closes with
who resolved it, and `@` mentions read as names. `--all-comments` shows the rest,
`--no-pager` prints directly, and `--json` prints the whole thing.

A pull request URL carries its own workspace and repo, so `--repo` is not needed
alongside one. Long pull requests stop at 50 files and 200 comments. The file
list needs the repository read scope; without it that section says so and the
rest still prints.

## Development

```bash
pnpm test      # unit tests
pnpm check     # format, lint, typecheck (--fix to auto-fix)
pnpm build     # build dist/cli.mjs
pnpm dev       # build in watch mode
```

Commands live in `src/commands/`, API clients in `src/api/`, and the ADF
converters in `src/adf/`.
