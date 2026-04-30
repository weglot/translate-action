# Contributing to Weglot Translate Action

Thank you for your interest in contributing!

## Requirements

- Node.js >= 20 (see `.nvmrc`)
- Yarn 1.22.22

## Local setup

```bash
# Install dependencies
yarn install

# Build (compiles TypeScript → lib/, then bundles → dist/)
yarn build

# Run tests
yarn test

# Lint
yarn lint
```

## Project structure

```
src/          TypeScript source
dist/         Bundled output committed to the repo (single dist/index.js)
lib/          Compiled JS/d.ts (intermediate, not committed)
test/         Jest unit tests + fixtures
```

## Important: committing `dist/`

`dist/index.js` is the file GitHub Actions actually runs. It must be committed alongside every source change. Always run `yarn build` before committing, and include the updated `dist/` in your PR.

## Submitting a pull request

1. Fork the repository and create a branch from `master`.
2. Make your changes in `src/`.
3. Run `yarn build && yarn test && yarn lint` — all must pass.
4. Commit both source and the updated `dist/`.
5. Open a PR against `master` with a clear description of what and why.

## Reporting issues

Please use the GitHub issue templates for bug reports and feature requests.
