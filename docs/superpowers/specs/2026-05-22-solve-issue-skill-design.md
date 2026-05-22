# Design: `solve-issue` skill

**Date**: 2026-05-22
**Status**: Approved

## Overview

A Claude skill invoked as `/solve-issue <github-issue-url>` (or `owner/repo issue-number`). It reads a GitHub issue, explores the relevant codebase, proposes a diff-level implementation plan, waits for human approval, implements the fix, and opens a PR — with explicit confirmation gates before every remote action.

---

## Step-by-step flow

### Step 1 — Parse arguments

Two accepted formats:
- `owner/repo ISSUE_NUMBER` — e.g. `weglot/connect-edge 86`
- Full GitHub issue URL — e.g. `https://github.com/weglot/connect-edge/issues/86`

Extract `OWNER`, `REPO`, and `ISSUE_NUMBER`. If the input doesn't match either format, tell the user and stop.

### Step 2 — Fetch issue details

```bash
gh issue view <N> --repo <OWNER/REPO> --json title,body,labels,comments,assignees
```

Read the full issue title, body, labels, and all comments. Comments often contain key clarifications, reproduction steps, or prior fix attempts that are invisible from the title alone.

### Step 3 — Check for ambiguity

Before exploring any code, assess whether the issue is actionable:
- Does it describe the problem clearly enough to know what to change?
- Is there a clear expected behaviour or acceptance criterion?
- Is there a pointer to affected code, or enough context to find it?

If the issue is vague or underspecified, pause and ask the user clarifying questions **one at a time**. Only proceed once the intent is unambiguous. Do not explore the codebase until this is resolved.

### Step 4 — Explore the codebase

Clone the repo and check out the default branch:

```bash
TMPDIR=$(mktemp -d)
git clone --depth=50 https://github.com/<OWNER>/<REPO>.git "$TMPDIR/repo"
```

Use `git -C "$TMPDIR/repo"` and absolute paths for all subsequent commands. Do NOT use `cd` — it does not persist between tool calls.

Explore the repo:
1. Read the top-level structure to understand the project layout.
2. Navigate to the files most likely affected based on the issue description.
3. Read those files in full. Follow imports and callees as needed.

Produce an **Impact Summary** — a short internal note covering:
- Which files are relevant and why
- What the current behaviour is
- What needs to change at a high level

### Step 5 — Produce diff-level plan and wait for approval

Write a concrete sketch of the intended changes. For each file that needs to change, show which functions are added or modified and what the logic change is. Use pseudocode or rough diff notation — not necessarily compilable, but specific enough to catch wrong approaches before any code is written.

Example format:
```
src/auth/login.ts
- validateToken(): add null-check before accessing token.expiresAt
+ if (!token || !token.expiresAt) throw new AuthError('invalid token')

test/auth/login.test.ts
+ add test case: 'throws AuthError when token has no expiresAt'
```

List any assumptions explicitly — anything not directly stated in the issue that Claude inferred.

**Stop here and wait.** Ask the user:
> "Here's my plan. Does this look right, or would you like me to adjust anything before I start implementing?"

Do not write any code until the user approves. If they request changes, revise the plan and re-present.

### Step 6 — Create the branch

Infer the branch prefix from issue labels or content:
- `fix/` — bug reports, error labels, broken behaviour
- `feature/` — enhancement, feature request labels
- `quality/` — refactor, chore, tech debt, performance labels

If the prefix is ambiguous, state the choice and ask for confirmation before creating the branch.

Branch format: `<prefix>/<issue-number>-<short-slug>`
- Slug: 2–4 words max, lowercase, hyphenated, derived from the issue title
- Examples: `fix/86-user-deletion`, `feature/90-user-logs`, `quality/78-refacto-tokens`

```bash
git -C "$TMPDIR/repo" checkout -b <branch-name>
```

### Step 7 — Implement the changes

Apply the approved plan exactly as written. Use the `Edit` tool on `$TMPDIR/repo/<file>` for each file.

If something unexpected is discovered during implementation that requires a scope change (e.g., a dependency that needs updating, a shared utility that needs changing), **stop and flag it to the user** before continuing. Do not silently expand scope.

### Step 8 — Run tests

Look for a test command in `package.json` (`scripts.test`), `Makefile`, or a CI config file. If found, run it:

```bash
<test-command> 2>&1
```

Report results. If tests fail, diagnose and fix before proceeding. Do not push broken code.

If no test command is detectable, note that tests could not be run.

### Step 9 — Show diff → Gate 1: confirm before push

Show the full diff:
```bash
git -C "$TMPDIR/repo" diff HEAD
```

**Stop here and wait.** Ask the user:
> "Ready to push branch `<branch-name>` to origin. Confirm?"

Do not push until the user explicitly confirms. If they want adjustments, make them and re-show the diff.

Once confirmed:
```bash
git -C "$TMPDIR/repo" push origin <branch-name>
```

### Step 10 — Show PR details → Gate 2: confirm before PR creation

After the push succeeds, show the exact PR that will be created:

```
Title: <concise title referencing the issue>
Branch: <branch-name> → <base-branch>
Description:
Closes #<ISSUE_NUMBER>

<1–3 sentences describing what the PR does. Only longer if there is something genuinely important the reviewer needs to know.>
```

**Stop here and wait.** Ask the user:
> "Ready to open the PR with the details above. Confirm?"

Do not create the PR until the user explicitly confirms. If they want to adjust the title or description, update and re-show before proceeding.

Once confirmed:
```bash
gh pr create \
  --title "<title>" \
  --base <base-branch> \
  --body "$(cat <<'EOF'
Closes #<ISSUE_NUMBER>

<description>
EOF
)"
```

### Step 11 — Cleanup

```bash
rm -rf "$TMPDIR"
```

Clean up whether or not the user chose to push and open the PR.

---

## Key constraints

- **Two explicit confirmation gates**: one before `git push`, one before `gh pr create`. No remote action happens without the user typing "yes" (or equivalent).
- **No silent scope expansion**: if implementation reveals something outside the approved plan, stop and ask.
- **Ambiguity first**: clarifying questions happen before codebase exploration, not after.
- **`cd` never used**: all shell commands use `git -C "$TMPDIR/repo"` or absolute paths.
- **Broken code never pushed**: if tests fail, fix them before offering Gate 1.

---

## Branch naming reference

| Issue type         | Prefix      | Example                        |
|--------------------|-------------|--------------------------------|
| Bug / broken behaviour | `fix/`  | `fix/86-user-deletion`         |
| New feature        | `feature/`  | `feature/90-user-logs`         |
| Refactor / quality | `quality/`  | `quality/78-refacto-tokens`    |

## PR description template

```
Closes #<ISSUE_NUMBER>

<brief description — 1–3 sentences unless something important warrants more>
```
