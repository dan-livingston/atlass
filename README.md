# atlass

CLI to copy Jira issues and Confluence pages to Markdown, and push edits back to
Confluence.

Fetches an issue or page from Atlassian Cloud, converts its rich content to
Markdown, writes a `.md` file with YAML frontmatter, and downloads any
attachments alongside it. Confluence pages can be edited locally and updated
back on the server.

## Install

```bash
pnpm install
pnpm build
pnpm link --global   # exposes the `atlass` binary
```

Or run from source without linking:

```bash
node dist/cli.mjs <command>
```

## Authentication

Atlassian Cloud only. Auth uses your account email plus an API token
(Basic auth). Create a token at
`https://id.atlassian.com/manage-profile/security/api-tokens`.

```bash
atlass auth login
```

You are prompted for:

- site, e.g. `acme.atlassian.net`
- account email
- API token

The login is verified against `/rest/api/3/myself` before anything is saved.
The site and email are stored in `~/.config/atlass/config.json`
(or `$XDG_CONFIG_HOME/atlass/config.json`). The API token is stored in the OS
keyring (service `atlass`), never on disk.

```bash
atlass auth status   # show current site/email and whether a token is stored
atlass auth logout   # remove config and delete the token from the keyring
```

Only one account is supported at a time.

### Bitbucket

Bitbucket Cloud is supported for viewing pipeline results. It uses the same
Atlassian account email but a separate, Bitbucket-scoped API token (Atlassian
tokens are scoped per product at creation, so a Jira token cannot be reused).

```bash
atlass bitbucket login
```

You are prompted for:

- workspace, e.g. `acme` (from `bitbucket.org/acme/<repo>`)
- default repo slug (optional)
- API token, created with the `read:pipeline` and workspace-read scopes at
  `https://id.atlassian.com/manage-profile/security/api-tokens` (select Bitbucket
  as the app)

The login is verified against the workspace before anything is saved. The
workspace and optional default repo are stored in the `bitbucket` block of
`config.json`; the token is stored in the OS keyring under a separate entry.

```bash
atlass bitbucket status   # show workspace, default repo, and token presence
atlass bitbucket logout   # remove the Bitbucket config block and token
```

`bitbucket login`/`logout` are independent of `auth login`/`logout`: logging out
of one leaves the other intact.

## Usage

### Copy a Jira issue

```bash
atlass jira copy PROJ-123
atlass jira copy https://acme.atlassian.net/browse/PROJ-123
atlass jira copy            # prompts for the key or URL
```

Accepts an issue key or any URL containing one. Writes `PROJ-123.md` to the
current directory.

### Update a Jira issue

Copy an issue, edit the Markdown, then push the description back:

```bash
atlass jira update PROJ-123.md
atlass jira update                     # prompts for the file path
atlass jira update file.md --dry-run   # show what would change, write nothing
atlass jira update file.md --summary   # also push the H1 as the issue summary
```

The issue key comes from the file's frontmatter. The body is everything between
the H1 and the `## Comments` section; the frontmatter, the H1, and the
`## Comments` / `## Attachments` sections are not sent.

Only the description is updated by default. Pass `--summary` to also push the H1
as the new issue summary.

Notes and safety:

- The body is converted from Markdown to ADF. Only the standard constructs the
  copy produces round-trip (headings, lists, task lists, code, blockquotes,
  tables, rules, inline marks, links). Jira-specific content (panels, macros)
  was flattened to plain Markdown on copy and cannot be rebuilt. When the live
  description still contains such content, the update warns and asks for
  confirmation before overwriting.
- Jira has no page-style version number, so staleness is checked against the
  frontmatter `updated` timestamp. If the issue changed since you copied it, the
  update aborts so you can re-copy. `--force` overrides this and the data-loss
  confirmation.
- Image changes are not supported yet. External image URLs are kept as external
  media, but a local image reference aborts the update (edit text only), and a
  server-side image in the description is reported before it would be removed.

### Copy a Confluence page

```bash
atlass confluence copy 123456
atlass confluence copy https://acme.atlassian.net/wiki/spaces/DEV/pages/123456/Title
atlass confluence copy     # prompts for the id or URL
```

Accepts a numeric page id or a page URL. Writes `123456-title-slug.md` to the
current directory.

### Update a Confluence page

Copy a page, edit the Markdown, then push it back:

```bash
atlass confluence update 123456-title-slug.md
atlass confluence update            # prompts for the file path
atlass confluence update file.md --dry-run   # show what would change, write nothing
atlass confluence update file.md --title     # also rename the page to the H1
atlass confluence update file.md -m "fix typo"
```

The page id and version come from the file's frontmatter, so the file is
self-describing. The body is everything between the H1 and the `## Comments`
section; the frontmatter, the H1, and the `## Comments` / `## Attachments`
sections are not sent as page content.

Only the body is updated by default. Pass `--title` to also push the H1 as the
new page title.

Notes and safety:

- The body is converted from Markdown to ADF. Only the standard constructs the
  copy produces round-trip (headings, lists, task lists, code, blockquotes,
  tables, rules, inline marks, links, images). Confluence-specific content
  (panels, expands, macros, layouts) was flattened to plain Markdown on copy
  and cannot be rebuilt. When the live page still contains such content, the
  update warns and asks for confirmation before overwriting.
- Before writing, the current server version is checked against the frontmatter
  version. If the page changed since you copied it, the update aborts so you can
  re-copy. `--force` overrides this and the data-loss confirmation.
- Images referenced in the body are uploaded as attachments (matched by name and
  size, so unchanged images are not re-uploaded). Local paths resolve relative
  to the Markdown file; a missing local image aborts the update. External image
  URLs are kept as external media.
- Each update adds a version with the message `Updated via atlass` (override
  with `--message`).

### Search Jira issues

```bash
atlass jira search "safari login"                 # free text
atlass jira search --project PROJ --assignee me   # my open issues in PROJ
atlass jira search --status "In Progress"
atlass jira search --jql "project = PROJ AND labels = regression"
atlass jira search                                # recent issues
```

Friendly filters (`--project`, `--assignee`, `--status`, text) are AND'd
together and ordered by most recently updated. `--assignee me` maps to the
current user. `--jql` takes a raw query and cannot be combined with the friendly
filters. Prints one issue per line (`KEY  status  summary`); use `--json` for
machine output. Only the first `--limit` results are shown (default 25, max
100).

### List Jira projects

```bash
atlass jira projects            # every project you can browse
atlass jira projects pay        # filter by key or name
atlass jira projects --json     # machine output
```

A discovery aid for the `--project` filter above: it fetches every project
(paginated, ordered by key) and prints one per line as an aligned `KEY  Name`
list. An optional query filters by key or name server-side. `--json` emits
`{ key, name, id, type, url }` per project.

### List Jira statuses

```bash
atlass jira statuses                 # every status on the site
atlass jira statuses progress        # filter by name
atlass jira statuses --project PROJ  # statuses used by one project
atlass jira statuses --json          # machine output
```

A discovery aid for the `--status` filter above. Without `--project` it lists
every status on the site; with `--project` it lists the statuses that project's
issue types use (flattened to one list). An optional query filters by name
(case-insensitive substring). Statuses are collapsed by name and category, then
ordered by workflow lifecycle (To Do, then In Progress, then Done) and name.
Prints an aligned `Name  Category` list; `--json` emits
`{ name, id, category, categoryKey }` per status.

### Search Confluence pages

```bash
atlass confluence search "onboarding"
atlass confluence search --space DOCS
atlass confluence search --cql "label = runbook ORDER BY created DESC"
atlass confluence search                          # recent pages
```

Friendly mode always constrains to pages, so every result is copy-able. `--cql`
takes a raw query and cannot be combined with `--space` or text. Prints one page
per line (`id  space  title`); `--json` and `--limit` work as for Jira.

### Copy from search results

Add `--copy` to any search to pick results interactively and copy each to
Markdown (multi-select, needs an interactive terminal). With `--copy`, `--out`
is a directory that every selected file is written into:

```bash
atlass jira search --project PROJ --copy --out ./tickets/
atlass confluence search --space DOCS --copy
```

Copying continues on failure and reports a summary at the end.

### View Bitbucket pipelines

```bash
atlass bitbucket pipelines                 # recent runs for the default repo
atlass bitbucket pipelines --repo acme/web # a specific workspace/repo
atlass bitbucket pipelines --repo web      # bare slug, under the config workspace
atlass bitbucket pipelines --limit 50 --json
```

Lists recent pipeline runs, newest first, one per line
(`#build  status  ref  duration  age  creator`). Status shows the result
(`SUCCESSFUL`/`FAILED`/...) once a run completes, else its state
(`IN_PROGRESS`/`PENDING`/...). The repo comes from `--repo` (a `workspace/slug`
or a bare slug under the configured workspace), falling back to the configured
default repo. `--limit` defaults to 25, max 100. `--json` emits the full mapped
objects.

```bash
atlass bitbucket pipeline 124              # one run and its steps
atlass bitbucket pipeline 124 --repo acme/web
```

Shows a run summary (status, ref, commit, trigger, duration, creator) and its
step list (name, status, duration). The build number you pass is resolved to the
run directly, falling back to a bounded scan of recent runs if needed.

### Output location

By default files are written to the current directory, named after the issue
key (Jira) or `<id>-<title-slug>` (Confluence). Use `--out` to override:

```bash
atlass jira copy PROJ-123 --out ./tickets/          # directory: ./tickets/PROJ-123.md
atlass jira copy PROJ-123 --out ./bug.md            # explicit file path
```

Existing files are overwritten.

## Output format

Each file is:

- YAML frontmatter with metadata
- an H1 heading (issue summary / page title)
- the body, converted from ADF to Markdown
- a `## Comments` section (Jira comments / Confluence footer comments)
- an `## Attachments` section linking every downloaded file

Jira frontmatter: `key`, `type`, `status`, `assignee`, `reporter`, `priority`,
`labels`, `created`, `updated`, `url`.

Confluence frontmatter: `title`, `id`, `space`, `version`, `author`, `created`,
`updated`, `url`.

Example (Jira):

```markdown
---
key: "PROJ-123"
type: "Bug"
status: "In Progress"
assignee: "Dana Scully"
reporter: "Fox Mulder"
priority: "High"
labels:
    - "regression"
url: "https://acme.atlassian.net/browse/PROJ-123"
---

# Login button does nothing on Safari

Steps to reproduce...

## Comments

### Fox Mulder - 2025-07-01 10:30

Reproduced on 17.5.

## Attachments

- [screenshot.png](PROJ-123.assets/screenshot.png)
```

### Attachments

All attachments are downloaded into a sibling `<name>.assets/` folder and
listed under `## Attachments`. Inline images are linked to the local copy where
they can be matched:

- Confluence media nodes carry the attachment file id, so inline images resolve
  reliably.
- Jira media nodes usually expose only a filename, so inline images resolve when
  that filename matches an attachment; otherwise they render as
  `[embedded media: ...]` and the file is still captured in the attachments
  folder and section.

## Development

```bash
pnpm test      # run unit tests
pnpm check     # format, lint, typecheck (add --fix to auto-fix)
pnpm build     # build dist/cli.mjs
pnpm dev       # build in watch mode
```

### Layout

- `src/cli.ts` command wiring (commander)
- `src/commands/` `auth`, `jira`, `confluence`, `bitbucket` command handlers
- `src/api/` fetch client, Jira, Confluence and Bitbucket endpoints, attachment up/download
- `src/adf/` ADF to Markdown and Markdown to ADF converters (unit tested)
- `src/markdown/` frontmatter, comments, attachments, media resolver, update source
- `src/config.ts`, `src/credentials.ts` config file and keyring
- `src/util/` key/id parsing and output path resolution

The ADF to Markdown converter in `src/adf/to-markdown.ts` is a single hand
rolled walker shared by both commands. Confluence page bodies are requested as
`atlas_doc_format` so they flow through the same converter as Jira. The reverse
direction, `src/adf/from-markdown.ts`, tokenizes Markdown with `marked` and
emits ADF for the Confluence update command; it covers the same clean subset the
copy produces.
