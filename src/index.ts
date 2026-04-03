import * as core from "@actions/core";
import * as github from "@actions/github";
import path from "path";
import { fetchProjectSettings } from "./settings.js";
import { translateStrings } from "./translate.js";
import {
  extractLeafStrings,
  applyTranslations,
  readJson,
  writeJson,
} from "./file-types/json.js";
import { resolveSourceFiles, getOutputPath } from "./files.js";
import { computeTranslationPrBranchName, runGit } from "./helpers.js";

function filterLanguages(
  languagesInput: string,
  configuredLanguages: Array<{
    language_to: string;
    custom_code?: string;
  }>
): string[] {
  return languagesInput
    .split(",")
    .map(l => l.trim())
    .filter(code => {
      const ok = !!configuredLanguages.find(
        l => l.custom_code === code || l.language_to === code
      );
      if (ok) {
        return true;
      }

      core.warning(
        `Language "${code}" is not configured in your Weglot project; skipping.`
      );

      return false;
    });
}

async function main(): Promise<void> {
  try {
    const apiKey = core.getInput("api-key", { required: true }).trim();
    if (!apiKey) {
      core.setFailed("api-key is required");
      return;
    }

    const sourcePath = core.getInput("source-path", { required: true }).trim();
    const outputDir = core.getInput("output-dir", { required: false }).trim();
    const outputMode = (
      core.getInput("output-mode", { required: false }) || "files"
    ).toLowerCase();
    const languagesInput = core
      .getInput("languages", { required: false })
      .trim();
    const githubToken = (
      core.getInput("github-token", { required: false }).trim() ||
      process.env.GITHUB_TOKEN ||
      ""
    ).trim();

    const workspace = process.env.GITHUB_WORKSPACE || process.cwd();

    core.info("Fetching Weglot project settings...");
    const settings = await fetchProjectSettings(apiKey);
    const language_from = settings.language_from as string;
    const versions = settings.versions as Record<string, unknown> | undefined;
    const version =
      versions?.translations != null ? String(versions.translations) : "1";
    const languagesFromSettings = (settings.languages ?? []) as Array<{
      language_to: string;
      custom_code?: string;
    }>;

    const targetLanguages = languagesInput
      ? filterLanguages(languagesInput, languagesFromSettings)
      : languagesFromSettings.map(l => l.language_to);

    if (targetLanguages.length === 0) {
      core.setFailed("No target languages to translate.");
      return;
    }
    core.info(
      `Source language: ${language_from}. Target languages: ${targetLanguages.join(", ")}`
    );

    const sourceFiles = await resolveSourceFiles(sourcePath, workspace);
    if (sourceFiles.length === 0) {
      core.setFailed(`No files matched: ${sourcePath}`);
      return;
    }
    core.info(`Found ${sourceFiles.length} source file(s).`);

    const requestUrl =
      process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`
        : "https://github.com";

    const writtenPaths: string[] = [];
    for (const sourceFilePath of sourceFiles) {
      const relativePath = path.relative(workspace, sourceFilePath);
      if (!relativePath.endsWith(".json")) {
        core.warning(`Skipping non-JSON file: ${relativePath}`);
        continue;
      }

      const obj = await readJson(sourceFilePath);
      const { paths, values } = extractLeafStrings(obj);
      if (values.length === 0) {
        core.info(`No strings to translate in ${relativePath}`);
        continue;
      }

      for (const lTo of targetLanguages) {
        core.info(`Translating ${relativePath} -> ${lTo}...`);
        const translated = await translateStrings({
          apiKey,
          lFrom: language_from,
          lTo,
          requestUrl,
          strings: values,
          version,
        });
        const translatedObj = applyTranslations(obj, paths, translated);
        const outPath = getOutputPath(
          relativePath,
          lTo,
          language_from,
          outputDir,
          workspace
        );
        await writeJson(outPath, translatedObj);
        writtenPaths.push(outPath);
      }
    }

    if (writtenPaths.length === 0) {
      core.setFailed("No translated files were written.");
      return;
    }

    const outputBase = outputDir ? path.join(workspace, outputDir) : workspace;
    core.setOutput("output-path", outputBase);

    if (outputMode === "pr") {
      if (!githubToken) {
        core.setFailed(
          "PR mode requires a GitHub token. Add to your workflow: github-token: ${{ secrets.GITHUB_TOKEN }} (and permissions: contents: write, pull-requests: write)."
        );
        return;
      }
      const prBranchName = computeTranslationPrBranchName({
        apiKey,
        outputDir,
        sourcePath,
      });
      core.setOutput("pr-branch", prBranchName);
      core.info(`PR branch: ${prBranchName}`);
      await createPullRequest(
        workspace,
        writtenPaths,
        prBranchName,
        githubToken
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    core.setFailed(message);
  }
}

async function createPullRequest(
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
        | { default_branch?: string }
        | undefined
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

  // Refresh origin; decide between "new branch" and "track existing translations/*".
  await runGit(["fetch", "origin"], false);

  const remoteBranchExists =
    (await runGit(["rev-parse", "--verify", `origin/${branchName}`])) === 0;

  if (relativeWritten.length > 0) {
    await runGit(["add", "--", ...relativeWritten], false);
  }

  // Stash staged translations so checkout/merge cannot strand them on the wrong branch.
  const stashCode = await runGit([
    "stash",
    "push",
    "-m",
    "weglot-translate-action",
    "--staged",
  ]);
  if (stashCode !== 0) {
    core.setFailed(
      "Could not stash translation changes before switching branches."
    );
    return;
  }

  let stashAfterBranch: "pending" | "applied" | "pop_failed" = "pending";
  try {
    // Check out PR branch; if it already exists remotely, rebase it onto default first.
    if (remoteBranchExists) {
      if (
        (await runGit([
          "checkout",
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
      if ((await runGit(["checkout", "-B", branchName])) !== 0) {
        core.setFailed(`Could not create branch ${branchName}.`);
        return;
      }
    }

    if ((await runGit(["stash", "pop"])) !== 0) {
      stashAfterBranch = "pop_failed";
      core.setFailed(
        "Could not apply stashed translations (conflicts?). Fix conflicts and run again."
      );
      return;
    }
    stashAfterBranch = "applied";

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

    // Push updates the branch; open a PR only when none exists for this head.
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
  } finally {
    // Try to restore initial branch in all cases.
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

    // Aborted before successful checkout/pop: put stashed translations back on this branch.
    if (stashAfterBranch === "pending") {
      await runGit(["stash", "pop"]);
    }
  }
}

main();
