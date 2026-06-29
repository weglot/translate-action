import * as core from "@actions/core";
import * as github from "@actions/github";
import { readFile, writeFile } from "node:fs/promises";
import path from "path";
import { assertWithinWorkspace } from "./files.js";
import { runGit } from "./helpers.js";

export function issueCommentNumber(): number | undefined {
  if (github.context.eventName !== "issue_comment") {
    return undefined;
  }
  const payload = github.context.payload as { issue?: { number?: number } };
  return payload.issue?.number;
}

export async function postComment(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  body: string
): Promise<void> {
  const issueNumber = issueCommentNumber();
  if (issueNumber === undefined) {
    return;
  }
  try {
    await octokit.rest.issues.createComment({
      body,
      issue_number: issueNumber,
      owner,
      repo,
    });
  } catch (err) {
    core.warning(
      `Could not post comment to PR #${issueNumber}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function createPullRequest(
  workspace: string,
  writtenPaths: string[],
  branchName: string,
  githubToken: string
): Promise<void> {
  const octokit = github.getOctokit(githubToken);
  const { owner, repo } = github.context.repo;
  const defaultBranch =
    (
      github.context.payload.repository as
        { default_branch?: string } | undefined
    )?.default_branch ?? "main";

  await runGit(["config", "user.name", "github-actions[bot]"], false);
  await runGit(
    ["config", "user.email", "github-actions[bot]@users.noreply.github.com"],
    false
  );

  const relativeWritten = writtenPaths.map(p => path.relative(workspace, p));

  const fetchOpenPrUrl = async (): Promise<string | undefined> => {
    const { data } = await octokit.rest.pulls.list({
      head: `${owner}:${branchName}`,
      owner,
      per_page: 1,
      repo,
      state: "open",
    });
    return data[0]?.html_url;
  };

  // Snapshot translation file contents before switching branches so we can
  // re-write them after checkout without any stash machinery.
  const fileContents = new Map<string, Buffer>();
  for (const p of writtenPaths) {
    assertWithinWorkspace(workspace, p);
    fileContents.set(p, await readFile(p));
  }

  await runGit(["fetch", "origin"], false);

  const remoteBranchExists =
    (await runGit(["rev-parse", "--verify", `origin/${branchName}`])) === 0;

  try {
    // -f discards any untracked translation files that would otherwise block checkout.
    if (remoteBranchExists) {
      if (
        (await runGit([
          "checkout",
          "-f",
          "-B",
          branchName,
          `origin/${branchName}`,
        ])) !== 0
      ) {
        core.setFailed(`Could not check out origin/${branchName}.`);
        return;
      }
      if ((await runGit(["rebase", `origin/${defaultBranch}`])) !== 0) {
        await runGit(["rebase", "--abort"]);
        core.setFailed(
          `Rebase of ${branchName} onto origin/${defaultBranch} failed. Resolve conflicts locally on that branch.`
        );
        return;
      }
    } else {
      if (
        (await runGit([
          "checkout",
          "-f",
          "-B",
          branchName,
          `origin/${defaultBranch}`,
        ])) !== 0
      ) {
        core.setFailed(
          `Could not create branch ${branchName} from origin/${defaultBranch}.`
        );
        return;
      }
    }

    // Re-write translation files from the snapshot — always wins over whatever
    // was on the branch, with no conflict resolution needed.
    for (const [filePath, content] of fileContents) {
      await writeFile(filePath, content);
    }

    if (relativeWritten.length > 0) {
      await runGit(["add", "--", ...relativeWritten], false);
    }

    // Index matches HEAD (e.g. rebase + same content) → no commit/push.
    if ((await runGit(["diff", "--cached", "--quiet"])) === 0) {
      const existingUrl = await fetchOpenPrUrl();
      if (existingUrl) {
        core.setOutput("pr-url", existingUrl);
        core.info(
          `No new translation changes after rebasing onto ${defaultBranch}; open PR unchanged: ${existingUrl}`
        );
        await postComment(
          octokit,
          owner,
          repo,
          "Translations are already up to date — no changes from Weglot."
        );
      } else {
        core.info(
          `No translation changes to commit on ${branchName} and no open PR found.`
        );
      }
      return;
    }

    await runGit(
      ["commit", "-m", "Update Weglot translated localization files"],
      false
    );

    // After rebase, history may diverge from origin → force-with-lease (not plain force).
    const pushCode = remoteBranchExists
      ? await runGit(["push", "--force-with-lease", "-u", "origin", branchName])
      : await runGit(["push", "-u", "origin", branchName]);
    if (pushCode !== 0) {
      core.setFailed(`git push failed for ${branchName}.`);
      return;
    }

    let prUrl = await fetchOpenPrUrl();
    if (!prUrl) {
      const pr = await octokit.rest.pulls.create({
        base: defaultBranch,
        body: "This PR was created by the Weglot Translate Action with the latest translations.",
        head: branchName,
        owner,
        repo,
        title: "Add Weglot translated localization files",
      });
      prUrl = pr.data.html_url;
      core.info(`Pull request created: ${prUrl}`);
    } else {
      core.info(`Updated existing pull request branch ${branchName}: ${prUrl}`);
    }
    core.setOutput("pr-url", prUrl);
    await postComment(
      octokit,
      owner,
      repo,
      "Translations have been refreshed with the latest content from Weglot."
    );
  } finally {
    if ((await runGit(["checkout", "-"])) === 0) {
      core.info("Restored initial branch.");
    } else if (
      process.env.GITHUB_REF_NAME &&
      (await runGit(["checkout", process.env.GITHUB_REF_NAME])) === 0
    ) {
      core.info(
        `Checked out GITHUB_REF_NAME (${process.env.GITHUB_REF_NAME}).`
      );
    } else if ((await runGit(["checkout", defaultBranch])) === 0) {
      core.info(`Checked out repository default branch (${defaultBranch}).`);
    } else {
      core.warning(
        `Could not restore the original branch. You may still be on "${branchName}".`
      );
    }
  }
}
