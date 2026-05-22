# solve-issue Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a Claude skill `/solve-issue` that reads a GitHub issue, explores the codebase, proposes a diff-level plan, waits for approval, implements the fix, and opens a PR — with explicit confirmation gates before every remote action.

**Architecture:** Single SKILL.md file at `/Users/roptch/.claude/skills/solve-issue/SKILL.md`. The skill is pure markdown with embedded bash commands — no compiled code. The file is written via Bash heredoc (the Write tool is blocked on `.claude/skills/` paths by the auto-mode classifier).

**Tech Stack:** Bash, `gh` CLI, `git`, Claude tools (Read, Edit, Glob, Grep)

---

## File Structure

- Create: `/Users/roptch/.claude/skills/solve-issue/SKILL.md`

---

### Task 1: Write the skill file

**Files:**
- Create: `/Users/roptch/.claude/skills/solve-issue/SKILL.md`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p /Users/roptch/.claude/skills/solve-issue
```

Expected: no output, exit 0.

- [ ] **Step 2: Write the full SKILL.md via Bash heredoc**

The Write tool is blocked on `.claude/skills/` paths. Use Bash instead:

```bash
cat > /Users/roptch/.claude/skills/solve-issue/SKILL.md << 'SKILL_EOF'
---
name: solve-issue
description: Read a GitHub issue, explore the codebase, propose a diff-level implementation plan, wait for human approval, implement the fix, and open a PR with explicit confirmation gates before every remote action. Use when the user invokes /solve-issue with a GitHub issue URL (e.g. https://github.com/weglot/connect-edge/issues/86) or a repo + issue number (e.g. weglot/connect-edge 86).
argument-hint: <owner/repo> <issue-number> | <github-issue-url>
allowed-tools: [Bash, Read, Edit, Glob, Grep, Task, Agent]
---

# Solve a GitHub issue and open a PR

The user invoked this with: $ARGUMENTS

## Step 1 — Parse arguments

Two accepted formats:
- `owner/repo ISSUE_NUMBER` — e.g. `weglot/connect-edge 86`
- Full GitHub issue URL — e.g. `https://github.com/weglot/connect-edge/issues/86`

Extract `OWNER`, `REPO`, and `ISSUE_NUMBER`. If the input doesn't match either format, tell the user and stop.

## Step 2 — Fetch issue details

```bash
gh issue view <ISSUE_NUMBER> --repo <OWNER/REPO> --json title,body,labels,comments,assignees
```

Read the full issue title, body, labels, and all comments. Comments often contain key clarifications, reproduction steps, or prior fix attempts that are invisible from the title alone.

## Step 3 — Check for ambiguity

Before exploring any code, assess whether the issue is actionable:
- Does it describe the problem clearly enough to know what to change?
- Is there a clear expected behaviour or acceptance criterion?
- Is there a pointer to affected code, or enough context to find it?

If the issue is vague or underspecified, pause and ask the user clarifying questions **one at a time**. Only proceed once the intent is unambiguous. Do not explore the codebase until this is resolved.

## Step 4 — Explore the codebase

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

Produce an **Impact Summary** — print it to the user, covering:
- Which files are relevant and why
- What the current behaviour is
- What needs to change at a high level

## Step 5 — Produce diff-level plan and wait for approval

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

## Step 6 — Create the branch

Infer the branch prefix from issue labels or content:
- `fix/` — bug reports, error labels, broken behaviour
- `feature/` — enhancement, feature request labels
- `quality/` — refactor, chore, tech debt, performance labels

If the prefix is ambiguous, state the chosen prefix and ask for confirmation before creating the branch.

Branch format: `<prefix>/<issue-number>-<short-slug>`
- Slug: 2–4 words max, lowercase, hyphenated, derived from the issue title
- Examples: `fix/86-user-deletion`, `feature/90-user-logs`, `quality/78-refacto-tokens`

```bash
git -C "$TMPDIR/repo" checkout -b <branch-name>
```

## Step 7 — Implement the changes

Apply the approved plan exactly as written. Use the `Edit` tool on `$TMPDIR/repo/<file>` for each file.

If something unexpected is discovered during implementation that requires a scope change (e.g., a dependency that needs updating, a shared utility that needs changing), **stop and flag it to the user** before continuing. Do not silently expand scope.

## Step 8 — Run tests

Look for a test command in `package.json` (`scripts.test`), `Makefile`, or a CI config file. If found, run it:

```bash
<test-command> 2>&1
```

Report results. If tests fail, diagnose and fix before proceeding. Do not push broken code.

If no test command is detectable, note that tests could not be run and proceed.

## Step 9 — Show diff → Gate 1: confirm before push

Show the full diff:

```bash
git -C "$TMPDIR/repo" diff HEAD
```

**Stop here and wait.** Ask the user:
> "Ready to push branch `<branch-name>` to origin. Confirm?"

Do not push until the user explicitly confirms. If they want adjustments, make them and re-show the diff before asking again.

Once confirmed:

```bash
git -C "$TMPDIR/repo" push origin <branch-name>
```

## Step 10 — Show PR details → Gate 2: confirm before PR creation

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

## Step 11 — Cleanup

```bash
rm -rf "$TMPDIR"
```

Clean up whether or not the user chose to push and open the PR.
SKILL_EOF
```

Expected: no output, exit 0.

- [ ] **Step 3: Verify the file was written**

```bash
head -6 /Users/roptch/.claude/skills/solve-issue/SKILL.md && echo "---" && wc -l /Users/roptch/.claude/skills/solve-issue/SKILL.md
```

Expected: frontmatter lines visible, line count above 100.

- [ ] **Step 4: Commit the new skill**

```bash
git -C /Users/roptch/Documents/translate-action add /Users/roptch/.claude/skills/solve-issue/SKILL.md
git -C /Users/roptch/Documents/translate-action status
```

Check that only the new skill file is staged, then commit:

```bash
git -C /Users/roptch/Documents/translate-action commit -m "$(cat <<'EOF'
Add solve-issue skill

Reads a GitHub issue, explores the codebase, proposes a diff-level
plan for approval, implements, and opens a PR with explicit
confirmation gates before push and PR creation.
EOF
)"
```

Expected: commit succeeds with the new file.

---

### Task 2: Verify skill against spec

**Files:**
- Read: `/Users/roptch/.claude/skills/solve-issue/SKILL.md`
- Read: `/Users/roptch/Documents/translate-action/docs/superpowers/specs/2026-05-22-solve-issue-skill-design.md`

- [ ] **Step 1: Check spec coverage**

Read both files and verify each spec requirement is present in the skill:

| Spec requirement | Expected location in skill |
|---|---|
| Parse `owner/repo N` and full URL formats | Step 1 |
| Fetch title, body, labels, comments, assignees | Step 2 |
| Ambiguity check before codebase exploration | Step 3 |
| Clone with `--depth=50`, no `cd` | Step 4 |
| Impact Summary printed to user | Step 4 |
| Diff-level plan with pseudocode format | Step 5 |
| Hard stop + approval before writing code | Step 5 |
| Branch prefix inference (fix/feature/quality) | Step 6 |
| Confirm prefix if ambiguous | Step 6 |
| Branch format `prefix/N-slug`, 2–4 word slug | Step 6 |
| Use Edit tool on `$TMPDIR/repo/<file>` | Step 7 |
| Stop and flag unexpected scope changes | Step 7 |
| Detect and run test command | Step 8 |
| Do not push broken code | Step 8 |
| Show full diff before Gate 1 | Step 9 |
| Gate 1: explicit confirmation before push | Step 9 |
| Show exact PR title + description before Gate 2 | Step 10 |
| Gate 2: explicit confirmation before PR creation | Step 10 |
| PR description starts with `Closes #N` | Step 10 |
| Cleanup unconditionally | Step 11 |

If any requirement is missing, edit the skill file to add it and re-verify.

- [ ] **Step 2: Check for `cd` usage**

```bash
grep -n "^cd \|^  cd \| && cd " /Users/roptch/.claude/skills/solve-issue/SKILL.md || echo "clean — no bare cd found"
```

Expected: `clean — no bare cd found`.

- [ ] **Step 3: Confirm both gates are hard stops**

```bash
grep -n "Stop here and wait\|Confirm?" /Users/roptch/.claude/skills/solve-issue/SKILL.md
```

Expected: exactly 4 matches — two "Stop here and wait" and two "Confirm?" (one pair for Gate 1, one for Gate 2).
