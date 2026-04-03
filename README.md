# Weglot Translate Action

GitHub Action to translate localization files using your [Weglot](https://weglot.com) project.

## Usage

### Minimal (write files to disk)

```yaml
- uses: actions/checkout@v4
- uses: weglot/translate-action@v1
  with:
    api-key: ${{ secrets.WEGLOT_API_KEY }}
    source-path: locales/en.json
  # Translated files appear in the same directory (e.g. locales/fr.json, locales/de.json)
```

### With output directory and target languages

```yaml
- uses: weglot/translate-action@v1
  with:
    api-key: ${{ secrets.WEGLOT_API_KEY }}
    source-path: "locales/**/*.json"
    output-dir: dist/locales
    languages: fr,de,es
```

### Create a PR with translations

In **`output-mode: pr`**, the action uses a deterministic branch name `translations/<16-char-hex>` derived from your **`source-path`**, **`output-dir`**, and **API key** (hashed; the key is never placed in the branch name). **Target languages are not part of the hash**, so adding a language in Weglot or changing the `languages` input updates the same branch and the same open PR. Use different `source-path` and/or `output-dir` (or a different Weglot project key) for a second job in the same repository.

```yaml
jobs:
  translate:
    runs-on: ubuntu-latest
    permissions:
      contents: write   # required for creating a branch and PR
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: weglot/translate-action@v1
        with:
          api-key: ${{ secrets.WEGLOT_API_KEY }}
          source-path: locales/en.json
          output-mode: pr
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

JavaScript actions do not receive `GITHUB_TOKEN` in the environment automatically—you must pass **`github-token`** (usually `${{ secrets.GITHUB_TOKEN }}`, same as `github.token`).

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | Yes | - | Weglot API key. |
| `source-path` | Yes | - | Path or glob to source file(s), e.g. `locales/en.json` or `locales/**/*.json`. |
| `output-dir` | No | (same as source) | Directory for translated files. |
| `output-mode` | No | `files` | `files` = write to disk; `pr` = push to deterministic branch `translations/<hash>` and open or update one PR per stream (see above). |
| `languages` | No | (from project) | Comma-separated target codes (e.g. `fr,de`). If empty, uses all languages from your Weglot project. |
| `github-token` | When `output-mode: pr` | - | Token for the GitHub API and `git push`. Use `${{ secrets.GITHUB_TOKEN }}`. Job needs `contents: write` and `pull-requests: write`. |

## Outputs

- `output-path`: Directory where translated files were written (`files` mode).
- `pr-branch`: Branch name used in `pr` mode (`translations/<hex>`).
- `pr-url`: URL of the pull request (`pr` mode) when a PR exists or was created; may be omitted when there was nothing new to push.

In workflow expressions, use bracket notation for hyphenated outputs, e.g. `${{ steps.<id>.outputs['output-path'] }}`.
