# Claude Code — Weglot Translate Action

## Commands

```bash
yarn build          # compile TS → lib/, bundle → dist/index.js
yarn test           # build + jest
yarn lint           # eslint src/
```

Node version: see `.nvmrc`. Package manager: Yarn 1.22.22.

## Critical: dist/ must be committed

`dist/index.js` is what GitHub Actions executes. It is **not** gitignored. Every PR that changes `src/` must include an updated `dist/` built with `yarn build`.

## Project structure

```
src/
  index.ts          entry point — reads action inputs, orchestrates translate + output
  translate.ts      Weglot API call (translate strings)
  settings.ts       Weglot API call (fetch project settings / languages)
  files.ts          glob resolution, output path computation
  helpers.ts        branch name hashing, misc utilities
  github.ts         git operations + GitHub API (PR create/update, comments)
  constants.ts      shared constants (e.g. UPDATE_COMMENT_TRIGGER)
  file-types/
    json.ts         JSON read/write, leaf-string extraction and re-application
dist/               bundled single-file output (committed)
lib/                compiled TS (intermediate, gitignored)
test/
  *.test.ts         Jest unit tests
  fixtures/         sample locale files used by tests and CI integration
```

## Action inputs / outputs

Defined in `action.yml`. Two output modes:
- `files` — writes translated files alongside sources
- `pr` — pushes to a deterministic branch `translations/<hex>` and opens/updates one PR

The PR branch name is derived from `source-path`, `output-dir`, and the API key (hashed — key never appears in the branch name). See `helpers.ts`.

## CI

- `.github/workflows/test.yml` — build, unit tests, and a live `files` mode integration test
- `.github/workflows/test-pr-mode.yml` — live `pr` mode integration test (runs on push to master and `/update` comments)

Both workflows require a `WEGLOT_API_KEY` repository secret.
