# atlass

CLI to copy Jira issues and Confluence pages to Markdown.

Fetches an issue or page from Atlassian Cloud, converts its rich content to
Markdown, writes a `.md` file with YAML frontmatter, and downloads any
attachments alongside it.

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

## Usage

### Copy a Jira issue

```bash
atlass jira copy PROJ-123
atlass jira copy https://acme.atlassian.net/browse/PROJ-123
atlass jira copy            # prompts for the key or URL
```

Accepts an issue key or any URL containing one. Writes `PROJ-123.md` to the
current directory.

### Copy a Confluence page

```bash
atlass confluence copy 123456
atlass confluence copy https://acme.atlassian.net/wiki/spaces/DEV/pages/123456/Title
atlass confluence copy     # prompts for the id or URL
```

Accepts a numeric page id or a page URL. Writes `123456-title-slug.md` to the
current directory.

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
- `src/commands/` `auth`, `jira`, `confluence` command handlers
- `src/api/` fetch client, Jira and Confluence endpoints, attachment downloader
- `src/adf/` ADF to Markdown converter (unit tested)
- `src/markdown/` frontmatter, comments, attachments, media resolver
- `src/config.ts`, `src/credentials.ts` config file and keyring
- `src/util/` key/id parsing and output path resolution

The ADF to Markdown converter in `src/adf/to-markdown.ts` is a single hand
rolled walker shared by both commands. Confluence page bodies are requested as
`atlas_doc_format` so they flow through the same converter as Jira.
