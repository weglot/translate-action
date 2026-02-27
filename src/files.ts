import path from "path";
import { glob } from "glob";

export async function resolveSourceFiles(
  sourcePath: string,
  workspace: string
): Promise<string[]> {
  const pattern = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.join(workspace, sourcePath);
  const files = await glob(pattern, { nodir: true, absolute: true });
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
  const newRelative = newSegments.join(path.sep);
  const base = outputDir ? path.join(workspace, outputDir) : workspace;
  return path.join(base, newRelative);
}
