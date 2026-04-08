import { exec, getExecOutput } from "@actions/exec";
import { createHash } from "node:crypto";

function gitWorkingDirectory(): string {
  return process.env.GITHUB_WORKSPACE || process.cwd();
}

export const STASH_MESSAGE = "weglot-translate-action";

export async function runGit(
  args: string[],
  ignoreReturnCode?: boolean
): Promise<number> {
  return exec("git", args, {
    cwd: gitWorkingDirectory(),
    ignoreReturnCode: ignoreReturnCode !== false,
  });
}

export async function popWeglotStash(): Promise<boolean> {
  const { stdout: stashList } = await getExecOutput("git", ["stash", "list"], {
    cwd: gitWorkingDirectory(),
    ignoreReturnCode: true,
  });
  if (
    stashList.includes(STASH_MESSAGE) &&
    (await runGit(["stash", "pop"])) !== 0
  ) {
    return false;
  }

  return true;
}

export function computeTranslationPrBranchName(options: {
  apiKey: string;
  outputDir: string;
  sourcePath: string;
}): string {
  const digest = createHash("sha256")
    .update(
      [options.apiKey, options.sourcePath, options.outputDir].join("\0"),
      "utf8"
    )
    .digest("hex")
    .slice(0, 16);

  return `translations/${digest}`;
}
