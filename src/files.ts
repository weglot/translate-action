import path from "path";
import { glob } from "glob";

export function assertWithinWorkspace(
  workspace: string,
  filePath: string
): void {
  const resolved = path.resolve(filePath);
  const root = path.resolve(workspace);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(
      `Path "${resolved}" is outside the workspace boundary "${root}".`
    );
  }
}

export async function resolveSourceFiles(
  sourcePath: string,
  workspace: string
): Promise<string[]> {
  const pattern = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.join(workspace, sourcePath);
  assertWithinWorkspace(workspace, pattern);
  const files = await glob(pattern, { nodir: true, absolute: true });
  for (const file of files) {
    assertWithinWorkspace(workspace, file);
  }
  return files.sort();
}

export function getOutputPath(
  sourceRelativePath: string,
  targetLang: string,
  sourceLang: string,
  outputDir: string,
  workspace: string
): string {
  const segments = sourceRelativePath.split(path.sep);
  const newSegments = segments.map(seg => {
    if (seg === sourceLang) {
      return targetLang;
    }
    const base = path.basename(seg, path.extname(seg));
    if (base === sourceLang) {
      return targetLang + path.extname(seg);
    }
    return seg;
  });

  const unchanged =
    newSegments.length === segments.length &&
    newSegments.every((seg, i) => seg === segments[i]);

  let finalSegments = newSegments;
  if (unchanged) {
    if (finalSegments.length === 0) {
      finalSegments = [`${targetLang}`];
    } else {
      const last = finalSegments[finalSegments.length - 1];
      const ext = path.extname(last);
      const base = path.basename(last, ext);
      finalSegments = [
        ...finalSegments.slice(0, -1),
        `${base}-${targetLang}${ext}`,
      ];
    }
  }

  const newRelative = finalSegments.join(path.sep);
  const base = outputDir ? path.join(workspace, outputDir) : workspace;
  assertWithinWorkspace(workspace, base);
  const relativeToBase = outputDir ? path.basename(newRelative) : newRelative;
  const result = path.join(base, relativeToBase);
  assertWithinWorkspace(workspace, result);
  return result;
}
