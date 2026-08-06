# website

The [Docusaurus](https://docusaurus.io/) site for react-native-gtkx's
documentation. It is a workspace of the repo's npm monorepo — install and
build from the repo root, not from here directly.

The docs plugin reads content straight from the repo's `../docs` tree, so
that stays the canonical, GitHub-browsable location; nothing under `docs/`
moves into `website/`.

## Local development

From the repo root:

```bash
npm install
npm run start -w website
```

Starts a dev server with live reload.

## Build

```bash
npm run build -w website
```

Generates static content into `website/build/`.

## Deployment

CI builds this workspace as a check on every PR touching `docs/**` or
`website/**` (`.github/workflows/docs.yml`). Publishing to GitHub Pages on
push to `main` is a separate, later step — see the docs-site epic.
