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
    const prBranch = core.getInput("pr-branch", { required: false }).trim();
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
      await createPullRequest(workspace, writtenPaths, prBranch, githubToken);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    core.setFailed(message);
  }
}

async function createPullRequest(
  workspace: string,
  writtenPaths: string[],
  prBranchInput: string,
  githubToken: string
): Promise<void> {
  const exec = (await import("@actions/exec")).exec;
  const octokit = github.getOctokit(githubToken);
  const branchName = prBranchInput || `weglot-translations-${Date.now()}`;

  await exec("git", ["config", "user.name", "github-actions[bot]"], {
    cwd: workspace,
  });
  await exec(
    "git",
    ["config", "user.email", "github-actions[bot]@users.noreply.github.com"],
    {
      cwd: workspace,
    }
  );

  for (const p of writtenPaths) {
    const relative = path.relative(workspace, p);
    await exec("git", ["add", "--", relative], { cwd: workspace });
  }

  const diffExitCode = await exec("git", ["diff", "--cached", "--quiet"], {
    cwd: workspace,
    ignoreReturnCode: true,
  });
  if (diffExitCode === 0) {
    core.info(
      "No translation changes compared to the current branch; skipping pull request."
    );
    return;
  }

  await exec("git", ["checkout", "-b", branchName], { cwd: workspace });

  await exec(
    "git",
    ["commit", "-m", "Add Weglot translated localization files"],
    {
      cwd: workspace,
    }
  );
  await exec("git", ["push", "-u", "origin", branchName], { cwd: workspace });

  const { owner, repo } = github.context.repo;
  const defaultBranch =
    (
      github.context.payload.repository as
        | { default_branch?: string }
        | undefined
    )?.default_branch ?? "main";

  const pr = await octokit.rest.pulls.create({
    base: defaultBranch,
    body: "This PR was created by the Weglot Translate Action with the latest translations.",
    head: branchName,
    owner,
    repo,
    title: "Add Weglot translated localization files",
  });
  core.setOutput("pr-url", pr.data.html_url);
  core.info(`Pull request created: ${pr.data.html_url}`);

  const gitCheckout = async (args: string[]): Promise<boolean> => {
    const code = await exec("git", args, {
      cwd: workspace,
      ignoreReturnCode: true,
    });
    return code === 0;
  };

  if (await gitCheckout(["checkout", "-"])) {
    core.info("Restored initial branch.");
  } else if (
    process.env.GITHUB_REF_NAME &&
    (await gitCheckout(["checkout", process.env.GITHUB_REF_NAME]))
  ) {
    core.info(`Checked out GITHUB_REF_NAME (${process.env.GITHUB_REF_NAME}).`);
  } else if (await gitCheckout(["checkout", defaultBranch])) {
    core.info(`Checked out repository default branch (${defaultBranch}).`);
  } else {
    core.warning(
      `Could not restore the original branch after creating the PR; still on "${branchName}". Later steps may miss files if your default branch (${defaultBranch}) differs from the branch this job checked out.`
    );
  }
}

main();
