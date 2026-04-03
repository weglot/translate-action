import { exec } from "@actions/exec";
import { createHash } from "node:crypto";

function gitWorkingDirectory(): string {
  return process.env.GITHUB_WORKSPACE || process.cwd();
}

export async function runGit(
  args: string[],
  ignoreReturnCode?: boolean
): Promise<number> {
  return exec("git", args, {
    cwd: gitWorkingDirectory(),
    ignoreReturnCode: ignoreReturnCode !== false,
  });
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
