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
  return path.join(base, newRelative);
}
