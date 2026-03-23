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
  let replacedSourceLang = false;
  const newSegments = segments.map(seg => {
    if (seg === sourceLang) {
      replacedSourceLang = true;
      return targetLang;
    }
    const base = path.basename(seg, path.extname(seg));
    if (base === sourceLang) {
      replacedSourceLang = true;
      return targetLang + path.extname(seg);
    }
    return seg;
  });
  if (!replacedSourceLang && newSegments.length > 0) {
    const lastSegment = newSegments[newSegments.length - 1];
    const extension = path.extname(lastSegment);
    const baseName = path.basename(lastSegment, extension);
    newSegments[newSegments.length - 1] =
      `${baseName}.${targetLang}${extension}`;
  }
  const newRelative = newSegments.join(path.sep);
  const base = outputDir ? path.join(workspace, outputDir) : workspace;
  return path.join(base, newRelative);
}
