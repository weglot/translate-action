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

```yaml
jobs:
  translate:
    runs-on: ubuntu-latest
    permissions:
      contents: write   # required for creating a branch and PR
    steps:
      - uses: actions/checkout@v4
      - uses: weglot/translate-action@v1
        with:
          api-key: ${{ secrets.WEGLOT_API_KEY }}
          source-path: locales/en.json
          output-mode: pr
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | Yes | - | Weglot API key. |
| `source-path` | Yes | - | Path or glob to source file(s), e.g. `locales/en.json` or `locales/**/*.json`. |
| `output-dir` | No | (same as source) | Directory for translated files. |
| `output-mode` | No | `files` | `files` = write to disk; `pr` = create a branch and open a PR. |
| `languages` | No | (from project) | Comma-separated target codes (e.g. `fr,de`). If empty, uses all languages from your Weglot project. |
| `pr-branch` | No | (auto) | Branch name when `output-mode: pr`. |

## Outputs

- `output-path`: Directory where translated files were written (`files` mode).
- `pr-url`: URL of the created pull request (`pr` mode).

In workflow expressions, use bracket notation for hyphenated outputs, e.g. `${{ steps.<id>.outputs['output-path'] }}`.