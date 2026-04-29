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
import { computeTranslationPrBranchName } from "./helpers.js";
import { createPullRequest } from "./github.js";
import { UPDATE_COMMENT_TRIGGER } from "./constants.js";

interface LanguageTarget {
  languageTo: string;
  code: string;
}

function filterLanguages(
  languagesInput: string,
  configuredLanguages: Array<{
    language_to: string;
    custom_code?: string;
  }>
): LanguageTarget[] {
  return languagesInput
    .split(",")
    .map(l => l.trim())
    .flatMap(code => {
      const found = configuredLanguages.find(
        l => l.custom_code === code || l.language_to === code
      );
      if (!found) {
        core.warning(
          `Language "${code}" is not configured in your Weglot project; skipping.`
        );
        return [];
      }
      return [
        {
          languageTo: found.language_to,
          code: found.custom_code ?? found.language_to,
        },
      ];
    });
}

async function main(): Promise<void> {
  try {
    const isIssueComment = github.context.eventName === "issue_comment";

    // When triggered by a PR comment, only proceed for the UPDATE_COMMENT_TRIGGER command
    // on the translations PR — ignore everything else silently.
    if (isIssueComment) {
      const payload = github.context.payload as {
        comment?: { body?: string };
      };
      if (payload.comment?.body?.trim() !== UPDATE_COMMENT_TRIGGER) {
        core.info(`Skipping: not a "${UPDATE_COMMENT_TRIGGER}" comment.`);
        return;
      }
    }

    // Inputs
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

    // Guard: verify the comment was posted on the translations PR, not any other PR.
    if (isIssueComment) {
      if (outputMode !== "pr") {
        core.info(
          `Skipping: "${UPDATE_COMMENT_TRIGGER}" only applies in pr mode.`
        );
        return;
      }
      const issueNumber = (
        github.context.payload as { issue?: { number?: number } }
      ).issue?.number;
      if (issueNumber !== undefined && githubToken) {
        const octokit = github.getOctokit(githubToken);
        const { owner, repo } = github.context.repo;
        const expectedBranch = computeTranslationPrBranchName({
          apiKey,
          outputDir,
          sourcePath,
        });
        try {
          const { data: pr } = await octokit.rest.pulls.get({
            owner,
            pull_number: issueNumber,
            repo,
          });
          if (pr.head.ref !== expectedBranch) {
            core.info(
              `Skipping: "${UPDATE_COMMENT_TRIGGER}" was not posted on the translations PR.`
            );
            return;
          }
        } catch {
          core.info("Skipping: could not verify PR branch.");
          return;
        }
      }
    }

    // Project settings
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

    const targetLanguages: LanguageTarget[] = languagesInput
      ? filterLanguages(languagesInput, languagesFromSettings)
      : languagesFromSettings.map(l => ({
          languageTo: l.language_to,
          code: l.custom_code ?? l.language_to,
        }));

    if (targetLanguages.length === 0) {
      core.setFailed("No target languages to translate.");
      return;
    }
    core.info(
      `Source language: ${language_from}. Target languages: ${targetLanguages.map(l => l.code).join(", ")}`
    );

    // Translate
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

      for (const lang of targetLanguages) {
        core.info(`Translating ${relativePath} -> ${lang.code}...`);
        const translated = await translateStrings({
          apiKey,
          lFrom: language_from,
          lTo: lang.languageTo,
          requestUrl,
          strings: values,
          version,
        });
        const translatedObj = applyTranslations(obj, paths, translated);
        const outPath = getOutputPath(
          relativePath,
          lang.code,
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

    // PR mode: push translated files to a dedicated branch and open/update the PR
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

main();
